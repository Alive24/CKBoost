"use client";

import { forwardRef, useState, type CSSProperties, type ComponentProps, type ElementType } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";
import { useRevampTheme } from "./theme";
import { typography, type TagTone, type TypographyVariant } from "./tokens";
import styles from "./revamp.module.css";

type RevampButtonProps = Omit<ButtonProps, "variant" | "size" | "asChild"> & {
  variant?: "primary" | "secondary";
  size?: "small" | "default" | "large" | "icon";
} & ({asChild: true; loading?: never} | {asChild?: false; loading?: boolean});

export const RevampButton = forwardRef<HTMLButtonElement, RevampButtonProps>(function RevampButton(
  { variant = "primary", size = "default", className, type = "button", loading = false, disabled, children, ...props }, ref,
) {
  return <Button ref={ref} type={type} className={cn(styles.button, className)} data-variant={variant} data-size={size} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <><span aria-hidden="true" className={styles.spinner} />{children}</> : children}
  </Button>;
});

export const RevampInput = forwardRef<HTMLInputElement, ComponentProps<typeof Input> & {fieldSize?: "small" | "default" | "large"}>(function RevampInput({ className, fieldSize = "default", ...props }, ref) {
  return <Input ref={ref} className={cn(styles.input, className)} data-size={fieldSize} {...props} />;
});

export const RevampTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<typeof Textarea>>(function RevampTextarea({ className, ...props }, ref) {
  return <Textarea ref={ref} className={cn(styles.input, styles.textarea, className)} {...props} />;
});

export function RevampTag({ tone = "neutral", pill = false, style, className, ...props }: ComponentProps<typeof Badge> & { tone?: TagTone; pill?: boolean }) {
  return <Badge className={cn(styles.tag, className)} data-pill={pill} style={{
    "--tag-surface": `var(--ckb-tag-${tone}-surface)`,
    "--tag-text": `var(--ckb-tag-${tone}-text)`, ...style,
  } as CSSProperties} {...props} />;
}

export function RevampText({ variant = "body1", as: Component = "p", className, style, ...props }: ComponentProps<"p"> & { variant?: TypographyVariant; as?: ElementType }) {
  const [fontSize, lineHeight, fontWeight] = typography[variant];
  return <Component className={cn(styles.text, variant === "code" && styles.mono, className)} style={{ fontSize, lineHeight: `${lineHeight}px`, fontWeight, ...style }} {...props} />;
}

export type RevampIconName = "sun" | "moon" | "search" | "filter" | "caret-down";
export function RevampIcon({ name, className }: { name: RevampIconName; className?: string }) {
  return <span aria-hidden="true" data-icon={name} className={cn(styles.icon, className)} style={{ "--icon": `url('/assets/revamp/${name}.svg')` } as CSSProperties} />;
}

export const RevampSwitch = forwardRef<React.ElementRef<typeof Switch>, ComponentProps<typeof Switch>>(function RevampSwitch({className, ...props}, ref) {
  return <Switch ref={ref} className={cn(styles.switch, className)} {...props} />;
});

/** Portals stay inside the themed scope, including when the old site is Light. */
export function RevampSelect({ label, options, placeholder, triggerClassName, leadingIcon, displayValue, value, defaultValue, onValueChange, ...props }: ComponentProps<typeof SelectPrimitive.Root> & {
  label: string;
  placeholder?: string;
  triggerClassName?: string;
  leadingIcon?: RevampIconName;
  displayValue?: string;
  options: readonly {value: string; label: string; disabled?: boolean}[];
}) {
  const { portalContainer } = useRevampTheme();
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selectedValue = value ?? internalValue;
  const selectedLabel = displayValue ?? options.find(option => option.value === selectedValue)?.label ?? placeholder ?? "Select an option";
  return <SelectPrimitive.Root {...props} value={selectedValue} onValueChange={next => { setInternalValue(next); onValueChange?.(next); }}>
    <SelectPrimitive.Trigger className={cn(styles.selectTrigger, triggerClassName)} aria-label={label}>
      {leadingIcon && <RevampIcon name={leadingIcon} />}
      <SelectPrimitive.Value placeholder={placeholder}><span>{selectedLabel}</span></SelectPrimitive.Value>
      <SelectPrimitive.Icon asChild><RevampIcon name="caret-down" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal container={portalContainer ?? undefined}>
      <SelectPrimitive.Content className={styles.selectContent} position="popper" sideOffset={4}>
        <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>↑</SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className={styles.selectViewport}>
          {options.map(option => <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className={styles.selectItem}>
            <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator aria-hidden>✓</SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>↓</SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
}

export function RevampAlert({ tone, children }: { tone: "success" | "warning" | "error" | "info"; children: React.ReactNode }) {
  return <div className={styles.alert} role={tone === "error" ? "alert" : "status"} style={{
    "--alert-surface": `var(--ckb-status-${tone}-surface)`,
    "--alert-text": `var(--ckb-status-${tone}-text)`,
    "--alert-border": `var(--ckb-status-${tone}-border)`,
  } as CSSProperties}>{children}</div>;
}
