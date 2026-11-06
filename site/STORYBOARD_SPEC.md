# slop-deps — Web Experience & Motion Storyboard Spec

> **Document Purpose:** Real-time design & interaction specification dictated directly by Vidit. Every animation frame, timing curve, and visual layer is locked here.

---

## 1. Intro Sequence: The Dynamic Binary Handshake (Preloader Loop)

> **Core Rule:** Ye hardcoded fixed timer nahi hai. Ye loop **tab tak smoothly cycle karta rahega jab tak website ke saare assets, fonts aur 3D canvas background load nahi ho jaate (`document.readyState === 'complete'`).**

### Canvas Environment
* **Background:** Pure Void Black (`#000000` / `#040507`) — absolute pitch black, zero ambient light or distractions.
* **Glyph Color:** Milky White (`#F5F5F0` / `#EAEBE5`) with soft optical presence (no harsh blinding clip).
* **Corner Telemetry:** Bottom-right corner displays `connecting....` in subtle muted monospace.

### Dynamic Loading Architecture

```
[ Page Load Starts ] 
         │
         ▼
 ┌──► 0 (Milky White ~0.6s)
 │       │
 │       ▼ (Particles dissolve & fluidly swarm into shape)
 │    1 (Milky White ~0.6s)
 │       │
 │       ▼ (Particles dissolve & fluidly swarm into shape)
 └───────┴──► [ Assets Still Loading? ] ──► (Loop continues cycle)
                 │
                 ▼ [ ASSETS LOADED / READY! ]
             1 LOCKS SOLID (Logic High / Circuit On)
                 │
                 ▼ (Instant Trigger)
             Camera Dives / Zooms INSIDE "1" (0.7s)
                 │
                 ▼
             REVEAL: Main Screen (Canvas / Hero Viewport)
```

### Detailed Motion Specs

#### The Binary Particle Swarm Engine
* **Particle Geometry:** Normal round dots nahi honge. Har particle ek literal **`0` ya `1`** hoga!
* **GPU Instancing Optimization (Anti-Lag / Zero PC Explode):**
  - Performance bottleneck prevent karne ke liye offscreen canvas pe ek single `0` aur ek `1` prerender karke sprite cache banega.
  - ~1,200 binary particles (0s and 1s) GPU instancing se render honge. Even low-end phones aur laptops pe **smooth 60-120 FPS lock** rahega, zero stutter.
* `0` shape se disperse hote waqt saare `0` aur `1` ke digits hawa mein 3D space mein float karte hain.
* Uske baad magnetic swarm ki tarah pull hoke `1` banate hain.

#### The Wormhole Dive (Flying Through the Binary Swarm)
* Jab website ready hoti hai:
  - Camera `1` ke shape ke center mein physically dive karega.
  - Wo saare `0` aur `1` ke particles camera ke left, right, top, bottom se lightspeed star-trek warp speed pe piche nikalenge!
  - User ko feel hoga wo binary matrix ke andar travel karke Main Screen pe land kar raha hai.

---

## 2. Main Screen: Hero Typography & Atmosphere

### 3D Atmospheric Background
* **Not Dead Flat Black:** Pure empty black nahi hoga. 
* **Ambient Floating 3D Particles:** Deep background mein subtle, slow-drifting binary/dust particles honge with camera parallax. 
* Jab mouse hilega ya user scroll karega, ye background particles 3D depth mein halka sa drift karenge (infinite cyber-abyss / deep space feel).

### The "SLOP DEPS" Construction (Double-Outline Binary Core)
* **Layout:**
  ```
  S L O P
  D E P S
  ```
* **Exact Construction (Tu jo bol raha hai):**
  - Letter ka ek **outer border** hai aur ek **inner border** hai (double-line wireframe).
  - Beech ki jo puri body/tunnel hai — usme koi solid color fill nahi hai.
  - Uske andar **dense `0` aur `1` ke digits** ek doosre ke peeche line se baith ke pure letter ki shape bana rahe hain!
  - Jaise physical glass pipe ho, aur uske andar `0` aur `1` ka glowing liquid / data packets flow kar rahe hon!
  - `S` ka curve `010101` se banta hai, `L` ka right-angle `010101` se, `O` ka loop `010101` se, aur `P` ka head `010101` se!
  - Same for `D - E - P - S`.

### Interactive Cursor Physics (Magnetic Fluid Disturbance)
* **Hover Interaction:** Jab user mouse cursor ko `SLOP DEPS` ke letters ke upar ya paas leke aayega:
  - Cursor radius ke aas-paas ke `0` aur `1` ke digits halka sa **repel / scatter** honge (jaise magnetic fluid ya paani pe ungli chalayi ho).
  - **"Kharab wala disturb nahi":** Letter ki shape complete destroy nahi hogi, na glitchy spastic lagega.
  - High-stiffness spring physics (`Spring.DampingRatioNoBouncy`) use hogi — jaise hi cursor aage nikalta hai, particles smoothly wapas apni letter track ki exact position pe **snap/settle** ho jayenge.
  - Feels physical, tactile, and responsive.
