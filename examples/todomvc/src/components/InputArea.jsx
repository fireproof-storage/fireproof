import React from "react";
import { useInput } from "../hooks/useInput";

export default function InputArea({ onSubmit, placeholder, autoFocus = true }) {
  const { setValue, resetValue, ...inputProps } = useInput("", { controlled: true });
  if (autoFocus) {
    inputProps.autoFocus = true;
  }
  const handleNewTodoKeyDown = (event) => {
    if (event.keyCode !== 13) return;
    event.preventDefault();
    const val = event.target.value.trim();
    if (val) {
      onSubmit(val);
      setValue("");
    }
  };
  return <input className="new-todo" placeholder={placeholder} onKeyDown={handleNewTodoKeyDown} {...inputProps} />;
}
