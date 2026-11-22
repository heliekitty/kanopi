// Family avatars. Paste each SVG between the backticks, as one <svg ...>...</svg>.
// While a slot is empty, Kanopi shows a placeholder circle with the person's initial.
// Each avatar must appear only once per page, because ids inside an SVG (clip paths, defs) must stay unique.
// redpanda: red panda    koala: koala
window.KANOPI_AVATARS = {
  redpanda: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5.56 -26.44 388.89 388.89" width="400" height="400">
  <defs>
    <!-- Unified outer silhouette path -->
    <path id="silhouette-shape"
          d="M 142 98
             C 116 64, 86 58, 74 72
             C 60 88, 66 132, 82 162
             C 66 186, 62 214, 66 238
             C 74 286, 126 306, 200 306
             C 274 306, 326 286, 334 238
             C 338 214, 334 186, 318 162
             C 334 132, 340 88, 326 72
             C 314 58, 284 64, 258 98
             C 240 90, 220 86, 200 86
             C 180 86, 160 90, 142 98 Z" />

    <clipPath id="panda-clip">
      <use href="#silhouette-shape" />
    </clipPath>
  </defs>

  <!-- Clipped Interior Artwork (Transparent outside the outline) -->
  <g clip-path="url(#panda-clip)">
    <!-- Base Orange Fur -->
    <use href="#silhouette-shape" fill="#EA6A20" />

    <!-- Left Ear White Outer & Dark Brown Inner -->
    <path d="M 55 50 L 148 96 L 80 168 L 55 168 Z" fill="#FFFFFF" />
    <path d="M 128 100 C 110 80, 92 76, 86 84 C 80 92, 84 120, 94 140 C 106 124, 116 110, 128 100 Z" fill="#632B16" />

    <!-- Right Ear White Outer & Dark Brown Inner -->
    <path d="M 345 50 L 252 96 L 320 168 L 345 168 Z" fill="#FFFFFF" />
    <path d="M 272 100 C 290 80, 308 76, 314 84 C 320 92, 316 120, 306 140 C 294 124, 284 110, 272 100 Z" fill="#632B16" />

    <!-- White Cheek Fur -->
    <path d="M 55 204 C 84 202, 114 212, 136 228 L 136 315 L 55 315 Z" fill="#FFFFFF" />
    <path d="M 345 204 C 316 202, 286 212, 264 228 L 264 315 L 345 315 Z" fill="#FFFFFF" />

    <!-- Reddish-Brown Tear Stripes -->
    <path d="M 122 222 C 102 242, 98 276, 106 312 L 154 312 C 146 276, 148 244, 158 224 Z" fill="#8C4222" />
    <path d="M 278 222 C 298 242, 302 276, 294 312 L 246 312 C 254 276, 252 244, 242 224 Z" fill="#8C4222" />

    <!-- White Muzzle -->
    <ellipse cx="200" cy="256" rx="68" ry="52" fill="#FFFFFF" />
  </g>

  <!-- Continuous Outer Silhouette Stroke -->
  <use href="#silhouette-shape" fill="none" stroke="#1E120D" stroke-width="11" stroke-linejoin="round" stroke-linecap="round" />

  <!-- Eyebrows (Aligned above outer-mid eyes) -->
  <rect x="132" y="158" width="28" height="17" rx="8.5" fill="#FFFFFF" />
  <rect x="240" y="158" width="28" height="17" rx="8.5" fill="#FFFFFF" />

  <!-- Left Eye -->
  <circle cx="136" cy="204" r="17" fill="#1E120D" />
  <circle cx="130" cy="197" r="5" fill="#FFFFFF" />

  <!-- Right Eye -->
  <circle cx="264" cy="204" r="17" fill="#1E120D" />
  <circle cx="258" cy="197" r="5" fill="#FFFFFF" />

  <!-- Nose -->
  <path d="M 182 225 C 182 220, 218 220, 218 225 C 218 233, 206 242, 200 242 C 194 242, 182 233, 182 225 Z"
        fill="#1E120D" />

  <!-- Mouth -->
  <path d="M 200 240 L 200 255 M 164 255 C 164 269, 200 269, 200 255 C 200 269, 236 269, 236 255"
        fill="none" stroke="#1E120D" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`,
  koala: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320" width="400" height="320">
  <!-- Unified Koala Silhouette (Continuous outline with top fur tuft & fluffy ears) -->
  <path d="M 136 96
           C 114 68, 66 64, 44 86
           L 52 90
           C 34 102, 26 118, 26 134
           L 34 134
           C 24 148, 24 166, 32 178
           L 38 178
           C 44 206, 68 224, 92 224
           C 96 276, 144 304, 200 304
           C 256 304, 304 276, 308 224
           C 332 224, 356 206, 362 178
           L 368 178
           C 376 166, 376 148, 366 134
           L 374 134
           C 374 118, 366 102, 348 90
           L 356 86
           C 334 64, 286 68, 264 96
           C 248 80, 232 72, 218 68
           L 216 74
           C 208 68, 200 66, 194 72
           L 192 64
           C 172 68, 152 80, 136 96 Z"
        fill="#CCCCCC"
        stroke="#0A0A0A"
        stroke-width="8.5"
        stroke-linejoin="round"
        stroke-linecap="round" />

  <!-- Left Pink Inner Ear -->
  <path d="M 118 124
           C 98 102, 66 106, 56 130
           C 46 154, 62 184, 94 182
           C 98 160, 106 140, 118 124 Z"
        fill="#F4B2AB"
        stroke="#0A0A0A"
        stroke-width="6.5"
        stroke-linejoin="round" />

  <!-- Right Pink Inner Ear -->
  <path d="M 282 124
           C 302 102, 334 106, 344 130
           C 354 154, 338 184, 306 182
           C 302 160, 294 140, 282 124 Z"
        fill="#F4B2AB"
        stroke="#0A0A0A"
        stroke-width="6.5"
        stroke-linejoin="round" />

  <!-- Left Eye -->
  <ellipse cx="144" cy="196" rx="11" ry="13" fill="#0A0A0A" />

  <!-- Right Eye -->
  <ellipse cx="256" cy="196" rx="11" ry="13" fill="#0A0A0A" />

  <!-- Large Oval Nose (Aligned vertically with eyes, extending slightly lower) -->
  <path d="M 200 184
           C 182 184, 174 198, 176 216
           C 178 232, 188 238, 200 238
           C 212 238, 222 232, 224 216
           C 226 198, 218 184, 200 184 Z"
        fill="#0A0A0A" />

  <!-- Compact Mouth Directly Under Nose -->
  <path d="M 200 236 L 200 250
           M 178 248 C 178 262, 200 262, 200 250
           C 200 262, 222 262, 222 248"
        fill="none"
        stroke="#0A0A0A"
        stroke-width="5.5"
        stroke-linecap="round"
        stroke-linejoin="round" />
</svg>`
};
