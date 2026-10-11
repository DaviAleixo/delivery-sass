import React, { forwardRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { formatToBRL, maskBRLInput, parseBRLToNumber } from "@/utils/moneyMask";

/**
 * Componente CurrencyInput - Máscara Brasileira de Dinheiro (R$ Real)
 * Preenche da direita para a esquerda (centavos) com suporte a casas decimais e separador de milhar.
 */
export const CurrencyInput = forwardRef(({
  value,
  onChange,
  onValueChange,
  withPrefix = true,
  placeholder = "R$ 0,00",
  className = "",
  ...props
}, ref) => {
  const [displayValue, setDisplayValue] = useState(() => {
    if (value === 0 || value === "0") return withPrefix ? "R$ 0,00" : "0,00";
    return formatToBRL(value, withPrefix);
  });

  useEffect(() => {
    if (value === "" || value === null || value === undefined) {
      setDisplayValue("");
    } else {
      const numFromProp = typeof value === "number" ? value : parseBRLToNumber(value);
      const currentNum = parseBRLToNumber(displayValue);
      // Atualiza apenas se o número tiver mudado externamente
      if (numFromProp !== currentNum || !displayValue) {
        setDisplayValue(formatToBRL(value, withPrefix));
      }
    }
  }, [value, withPrefix]);

  const handleChange = (e) => {
    const rawInput = e.target.value;
    const digits = rawInput.replace(/\D/g, "");

    let masked = "";
    let numeric = 0;

    if (digits.length > 0) {
      masked = maskBRLInput(digits, withPrefix);
      numeric = parseInt(digits, 10) / 100;
    }

    setDisplayValue(masked);

    // Notifica o callback onChange tradicional
    if (onChange) {
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          name: props.name,
          value: masked,
          numericValue: numeric
        }
      };
      onChange(syntheticEvent);
    }

    // Notifica o callback onValueChange (numeric, formatted)
    if (onValueChange) {
      onValueChange(numeric, masked);
    }
  };

  const handleFocus = (e) => {
    // Seleciona todo o texto para permitir digitação direta sem precisar apagar dígito por dígito
    e.target.select();
    if (props.onFocus) {
      props.onFocus(e);
    }
  };

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  );
});

CurrencyInput.displayName = "CurrencyInput";

export default CurrencyInput;
