import { ResolvedTheme } from "./ThemeProvider";

/**
 * Clerk renders its own DOM (user menu, sign-in modal) and does not read our
 * CSS custom properties, so the palette has to be handed to it explicitly.
 *
 * The values are literal hex rather than `var(--token)` on purpose: Clerk
 * derives hover/active shades by doing colour maths on what it is given, and it
 * cannot compute against a CSS variable reference.
 */
export function clerkAppearance(theme: ResolvedTheme) {
  const dark = theme === "dark";
  return {
    variables: {
      colorPrimary: dark ? "#818cf8" : "#6366f1",
      colorBackground: dark ? "#1c1c21" : "#ffffff",
      colorText: dark ? "#ececee" : "#18181b",
      colorTextSecondary: dark ? "#a1a1aa" : "#52525b",
      colorInputBackground: dark ? "#232328" : "#ffffff",
      colorInputText: dark ? "#ececee" : "#18181b",
      colorDanger: dark ? "#f87171" : "#dc2626",
      colorSuccess: dark ? "#4ade80" : "#16a34a",
      colorWarning: dark ? "#fbbf24" : "#d97706",
      borderRadius: "10px",
    },
  };
}

/** Appearance for the small avatar button in the sidebar. */
export function userButtonAppearance(theme: ResolvedTheme) {
  return {
    ...clerkAppearance(theme),
    elements: {
      userButtonAvatarBox: { width: "26px", height: "26px" },
    },
  };
}
