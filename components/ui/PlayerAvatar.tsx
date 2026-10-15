import { initialsOf } from "@/features/game/constants/botPlayers";

/**
 * Round player avatar with a gold ring.
 *
 * Shows `image` when one is given, otherwise the player's initials on a
 * colour derived from `hue`, so every opponent has a recognisable face even
 * before real avatar art exists.
 */
export function PlayerAvatar({
  name,
  hue = 35,
  image,
  size = "md",
}: {
  name: string;
  hue?: number;
  image?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`player-avatar player-avatar-${size}`}
      style={{ "--avatar-hue": hue } as React.CSSProperties}
      aria-hidden="true"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny static avatar, no optimisation needed
        <img src={image} alt="" />
      ) : (
        <span className="player-avatar-initials">{initialsOf(name)}</span>
      )}
    </span>
  );
}