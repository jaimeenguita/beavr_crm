"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import type { Company } from "@/components/CompanyDialogs";
import { FormField } from "@/components/FormField";
import {
  AGENT_ERROR_MESSAGE,
  chatErrorText,
  hasPendingProposal,
  PROPOSAL_CANCELLED,
  PROPOSAL_NOT_FOUND,
  proposalName,
  proposalResultText,
  resolveProposal,
  shouldSendProposalAnswer,
  textBlocks,
  visibleParts,
  type ProposalPart,
  type ResolvedProposal,
} from "@/lib/agente/chat";
import type { AgentUIMessage, ProposalResult } from "@/lib/agente/tools";
import { addDays, DEFAULT_DUE_DAYS, IVA_PCT, toIsoDate, type Invoice, type Sale } from "@/lib/crm/facturas";
import {
  cancelInvoice,
  createDraftFromSale,
  issueDraft,
  markPaid,
  type InvoiceActionResult,
} from "@/lib/crm/invoiceActions";

const SUGGESTIONS = ["¿Qué facturas están vencidas?", "Resume este mes", "¿Qué ventas faltan por facturar?"];

function toResult({ error }: InvoiceActionResult): ProposalResult {
  return error ? { ok: false, error } : { ok: true };
}

type RunnableProposal = Exclude<ResolvedProposal, { kind: "blocked" }>;

// Runs a confirmed proposal with the same actions as the Facturas tab, on the records the card showed.
async function runProposal(part: ProposalPart, target: RunnableProposal): Promise<ProposalResult> {
  if (target.kind === "sale") {
    const fecha_emision = toIsoDate(new Date());
    const dates = { fecha_emision, fecha_vencimiento: addDays(fecha_emision, DEFAULT_DUE_DAYS) };
    return toResult(await createDraftFromSale(target.sale, dates, IVA_PCT));
  }
  const { invoice, precio } = target;
  switch (part.type) {
    case "tool-proposeMarkPaid":
      return toResult(await markPaid(invoice.id));
    case "tool-proposeCancel":
      return toResult(await cancelInvoice(invoice.id));
    default:
      return toResult(await issueDraft(invoice, precio, new Date()));
  }
}

function ProposalCard({
  part,
  target,
  onAnswer,
}: {
  part: ProposalPart;
  target: ResolvedProposal | null;
  onAnswer: (confirmed: boolean) => Promise<void>;
}) {
  // Answered once: the ref blocks a second click before the re-render and the card is never unlocked, so a
  // change cannot run twice. The buttons give way to the result when the part receives its output. They are
  // aria-disabled, not disabled, so the focused button keeps focus while the change runs.
  const locked = useRef(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [running, setRunning] = useState(false);
  const result = proposalResultText(part);
  const canConfirm = target !== null && target.kind !== "blocked";

  // The buttons the user answered with are replaced by the result, so focus moves there instead of to <body>.
  useEffect(() => {
    if (result !== null && locked.current) resultRef.current?.focus();
  }, [result]);

  const answer = (confirmed: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setRunning(true);
    void onAnswer(confirmed);
  };

  return (
    <div className="agent-proposal" aria-busy={running && result === null}>
      <p>{target?.description ?? PROPOSAL_NOT_FOUND}</p>
      {result !== null ? (
        <p ref={resultRef} className="agent-proposal-result" tabIndex={-1}>
          {result}
        </p>
      ) : (
        <div className="crm-toolbar-actions">
          {canConfirm ? (
            <button type="button" className="btn btn-primary" aria-disabled={running} onClick={() => answer(true)}>
              Confirmar
            </button>
          ) : null}
          <button type="button" className="btn" aria-disabled={running} onClick={() => answer(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function AssistantText({ text }: { text: string }) {
  return textBlocks(text).map((block, index) => {
    if (block.kind === "list") {
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ul>
      );
    }
    if (block.kind === "table") {
      return (
        <div key={index} className="crm-table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                {block.header.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p key={index}>
        {block.lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex > 0 ? <br /> : null}
            {line}
          </span>
        ))}
      </p>
    );
  });
}

export function AgentePanel({
  invoices,
  sales,
  companies,
  onChanged,
}: {
  invoices: Invoice[];
  sales: Sale[];
  companies: Company[];
  onChanged: () => Promise<void>;
}) {
  const token = useAuth().session?.access_token ?? "";
  // useChat sends with the latest transport, so a refreshed token is used from the next request on.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AgentUIMessage>({
        api: "/api/agente/chat",
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );
  const { messages, sendMessage, addToolOutput, status, error } = useChat<AgentUIMessage>({
    transport,
    sendAutomaticallyWhen: shouldSendProposalAnswer,
  });
  const [question, setQuestion] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const wasBusy = useRef(false);

  const busy = status === "submitted" || status === "streaming";
  const waiting = !busy && hasPendingProposal(messages);
  const inputLocked = busy || waiting;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, error]);

  // Back to the question once the answer arrives, unless the user has moved focus outside the panel meanwhile.
  useEffect(() => {
    const active = document.activeElement;
    if (wasBusy.current && !busy && (active === document.body || panelRef.current?.contains(active))) {
      inputRef.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || inputLocked) return;
    setQuestion("");
    void sendMessage({ text: trimmed });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(question);
  };

  const answerProposal = async (part: ProposalPart, target: ResolvedProposal | null, confirmed: boolean) => {
    let output: ProposalResult;
    try {
      if (!target) output = { ok: false, error: PROPOSAL_NOT_FOUND };
      else if (target.kind === "blocked") output = { ok: false, error: target.description };
      else if (!confirmed) output = { ok: false, error: PROPOSAL_CANCELLED };
      else output = await runProposal(part, target);
    } catch {
      // A thrown action must still answer the tool, or the chat would wait on this card forever.
      output = { ok: false, error: AGENT_ERROR_MESSAGE };
    }
    if (output.ok) void onChanged();
    await addToolOutput({ tool: proposalName(part), toolCallId: part.toolCallId, output });
  };

  return (
    <section ref={panelRef} className="agent-panel" aria-labelledby="agente-titulo">
      <h2 id="agente-titulo">¿Qué quieres saber de tus ventas?</h2>
      <div className="filter-row agent-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="filter-chip"
            disabled={inputLocked}
            onClick={() => ask(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div
        className="agent-messages"
        role="log"
        aria-live="polite"
        aria-busy={busy}
        aria-label="Conversación con el agente"
      >
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="agent-message agent-message-user">
                <span className="sr-only">Tú: </span>
                {message.parts.map((part, index) => (part.type === "text" ? <p key={index}>{part.text}</p> : null))}
              </div>
            );
          }
          const parts = visibleParts(message);
          if (parts.length === 0) return null;
          return (
            <div key={message.id} className="agent-message">
              <span className="sr-only">Agente: </span>
              {parts.map((part, index) => {
                if (part.type === "text") return <AssistantText key={index} text={part.text} />;
                const target = resolveProposal(part, { invoices, sales, companies }, new Date());
                return (
                  <ProposalCard
                    key={part.toolCallId}
                    part={part}
                    target={target}
                    onAnswer={(confirmed) => answerProposal(part, target, confirmed)}
                  />
                );
              })}
            </div>
          );
        })}
        {busy ? <p className="agent-thinking">Pensando...</p> : null}
        {error && !busy ? (
          <div className="agent-message agent-message-error">
            <span className="sr-only">Agente: </span>
            <p>{chatErrorText(error)}</p>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form className="agent-composer" onSubmit={submit}>
        <FormField
          id="agente-pregunta"
          label="Pregunta al agente"
          help={waiting ? "Confirma o cancela la propuesta antes de seguir." : undefined}
        >
          {/* Read-only rather than disabled while busy or waiting, so pressing Enter does not drop focus to <body>. */}
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            readOnly={inputLocked}
            aria-disabled={inputLocked}
            autoComplete="off"
          />
        </FormField>
        <button type="submit" className="btn btn-primary" disabled={inputLocked}>
          Enviar
        </button>
      </form>
    </section>
  );
}
