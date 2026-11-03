import { avatarHue, initials } from '@/lib/format';

/** Initials on a pale tint of the person's own stable hue (identity, not data). */
export function Avatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const hue = avatarHue(id);
  return (
    <span
      aria-hidden
      className="grid flex-none place-items-center rounded-full font-extrabold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `light-dark(hsl(${hue} 70% 88%), hsl(${hue} 35% 26%))`,
        color: `light-dark(hsl(${hue} 55% 24%), hsl(${hue} 70% 85%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
