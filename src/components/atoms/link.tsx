import type { ComponentProps, MouseEvent } from "react";
import { isInAppClick, navigate } from "@/lib/router";

/** An anchor to a page of the app. Plain clicks switch pages without a reload. */
export function Link({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!isInAppClick(e) || props.target) return;
    e.preventDefault();
    navigate(href);
  };
  return <a {...props} href={href} onClick={handleClick} />;
}
