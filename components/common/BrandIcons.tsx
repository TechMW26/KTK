import type { SVGProps } from "react";

/**
 * Brand marks for the sign-in buttons.
 *
 * lucide-react ships an Apple glyph but has deprecated the rest of its brand
 * icons, so the Google and Facebook marks are inlined here from their public
 * brand guidelines (single-colour variants for the button treatment).
 */

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v2.98h3.87c2.26-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.87-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.29a12 12 0 0 0 0 10.8l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.73c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.6l3.98 3.09C6.22 6.84 8.87 4.73 12 4.73Z"
      />
    </svg>
  );
}

export function AppleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M16.36 12.7c.03 3.2 2.81 4.27 2.84 4.28-.02.08-.44 1.52-1.46 3.02-.88 1.29-1.8 2.58-3.25 2.6-1.42.03-1.88-.84-3.5-.84-1.62 0-2.13.82-3.47.87-1.4.05-2.46-1.4-3.35-2.68-1.82-2.64-3.21-7.45-1.34-10.7a5.19 5.19 0 0 1 4.37-2.67c1.37-.03 2.66.92 3.5.92.83 0 2.4-1.14 4.05-.97.69.03 2.63.28 3.87 2.1-.1.06-2.31 1.35-2.26 4.07M13.1 3.6c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.61-.69.79-1.29 2.06-1.13 3.28 1.19.09 2.41-.61 3.15-1.51"
      />
    </svg>
  );
}

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07"
      />
    </svg>
  );
}

export function EmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
