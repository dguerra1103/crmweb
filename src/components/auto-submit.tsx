"use client";

/** Select que envía su formulario al cambiar de valor. */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  className = "",
  title,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
  title?: string;
}) {
  return (
    <select
      name={name}
      title={title}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Botón que pide confirmación antes de ejecutar una acción destructiva. */
export function ConfirmButton({
  message,
  children,
  className = "",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </button>
  );
}
