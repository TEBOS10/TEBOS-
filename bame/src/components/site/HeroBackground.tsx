import Image from "next/image";

const SLIDES = [
  { src: "/hero/football.jpg", alt: "Footballer at full sprint under stadium floodlights" },
  { src: "/hero/tennis.jpg", alt: "Tennis player mid-serve at golden hour" },
  { src: "/hero/athletics.jpg", alt: "Sprinter exploding out of the blocks" },
];

export default function HeroBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-[var(--bame-bg)]">
      {SLIDES.map((slide, i) => (
        <div
          key={slide.src}
          className="hero-slide absolute inset-0"
          style={{ animationDelay: `${i * 5}s` }}
        >
          <Image
            src={slide.src}
            alt={slide.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            className="hero-slide-img object-cover"
            style={{ animationDelay: `${i * 5}s` }}
          />
        </div>
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--bame-bg)]/55 via-[var(--bame-bg)]/70 to-[var(--bame-bg)]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--bame-bg)]/70 via-transparent to-[var(--bame-bg)]/40" />
    </div>
  );
}
