export function MountainBackdrop() {
  return (
    <div className="motif-mountains" aria-hidden="true">
      <svg viewBox="0 0 1440 420" preserveAspectRatio="none">
        {/* Distant ridge: #12403c @ 70% */}
        <path
          d="M0,210 C180,140 320,175 490,120 C670,62 840,152 1030,108 C1195,70 1320,125 1440,92 L1440,420 L0,420 Z"
          fill="#12403c"
          fillOpacity="0.70"
        />
        {/* Mid ridge: #0d302e @ 90% */}
        <path
          d="M0,275 C210,205 400,255 620,192 C820,136 990,224 1210,176 C1320,152 1385,175 1440,165 L1440,420 L0,420 Z"
          fill="#0d302e"
          fillOpacity="0.90"
        />
        {/* Foreground ridge: #082321 @ 100% */}
        <path
          d="M0,335 C250,278 460,322 720,276 C960,234 1180,295 1440,248 L1440,420 L0,420 Z"
          fill="#082321"
        />
      </svg>
    </div>
  );
}
