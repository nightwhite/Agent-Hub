export type ControlSize = "xs" | "sm" | "md";

export const CONTROL_SIZE_CLASSNAME: Record<ControlSize, string> = {
  xs: "h-7 px-2 text-[10px]",
  sm: "h-8 px-2.5 text-[11px]",
  md: "h-9 px-3 text-[12px]",
};

export const FIELD_SIZE_CLASSNAME: Record<ControlSize, string> = {
  xs: "h-7 text-[10px]",
  sm: "h-8 text-[11px]",
  md: "h-9 text-[12px]",
};

export const FIELD_LABEL_CLASSNAME: Record<ControlSize, string> = {
  xs: "text-[10px] font-medium text-zinc-800",
  sm: "text-[11px] font-medium text-zinc-800",
  md: "text-[12px] font-medium text-zinc-800",
};
