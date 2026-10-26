import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string | null;
  children: ReactNode;
};

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

function isFormControl(type: unknown): boolean {
  return type === "input" || type === "select" || type === "textarea";
}

/**
 * Campo según skill ERP + WCAG: etiqueta siempre visible, * si obligatorio,
 * ayuda breve debajo y error junto al campo (aria-describedby en el control).
 */
export function FormField({ id, label, required, help, error, children }: FormFieldProps) {
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;

  const control = Children.map(children, (child) => {
    if (!isValidElement(child) || !isFormControl(child.type)) return child;
    const el = child as ReactElement<ControlProps>;
    return cloneElement(el, {
      id: el.props.id ?? id,
      "aria-describedby": describedBy ?? el.props["aria-describedby"],
      "aria-invalid": error ? true : el.props["aria-invalid"],
      "aria-required": required ? true : el.props["aria-required"],
    });
  });

  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required ? <RequiredMark /> : null}
        {required ? <span className="sr-only"> (obligatorio)</span> : null}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="form-error" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="form-help">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function RequiredMark() {
  return (
    <span className="form-required" aria-hidden="true">
      {" "}
      *
    </span>
  );
}
