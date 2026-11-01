# midigen·rhythm: technical overview

midigen·rhythm generates multi-lane drum rhythms from a style (a preset such as metal, baroque or tribal, or typed in), a plain-English description that modifies that style, and a list of song parts. The time signature, tempo and grid follow from the style unless you set them by hand. It then builds harmony and melody on top of the rhythm: a chord progression, a bass line locked to the kick, a rhythm section locked to the snare and hats, and a melody over the chords. Styles range from Gregorian chant and organum through baroque, classical and romantic to jazz, hard rock, metal and electronic music, plus maqam, raga and gamelan. Everything is in 12-tone equal temperament unless microtones are switched on. Songs are exported as Standard MIDI Files (drums for Superior Drummer 3 (SD3), pitched tracks for any instrument) that carry their full state, so a saved file can be opened again exactly. It runs in the browser with no dependencies and no build step.

This document describes what is implemented: the time model, the algorithms, how lanes and parts are made to line up, the harmony and melody layer, and how to use the output. Citations are author–year and refer to [§12 References](#12-references). [§13](#13-attribution-and-originality) separates borrowed code and published methods from the project's own heuristics.

**Contents**
1. [Pipeline](#1-pipeline)
2. [Time model](#2-time-model)
3. [Inputs](#3-inputs)
4. [Algorithms](#4-algorithms)
5. [Lane generators](#5-lane-generators)
6. [Alignment: lanes, parts and the loop](#6-alignment-lanes-parts-and-the-loop)
7. [Performance rendering](#7-performance-rendering)
8. [Harmony and melody](#8-harmony-and-melody)
9. [Using the output with Superior Drummer 3 and other instruments](#9-using-the-output-with-superior-drummer-3-and-other-instruments)
10. [Code map](#10-code-map)
11. [Limitations](#11-limitations)
12. [References](#12-references)
13. [Attribution and originality](#13-attribution-and-originality)

---

## 1. Pipeline

```
style text ─┐
            ├─► interpretDescriptors (style ×1, description ×1.3) ─► blendItems ─► parameter vector
description ┘                                                            │
resolveSong: meter / tempo / grid ─ set by hand, else written in the text ("in 7/8", "180 bpm"), else suggested by the styles
meter ─► parseMeter ─► tatum grid + metric weights                       │
for each part:  blend(style + description + part text) ─► applyRole ─► plan fill / blast / lull
                 └─► generate lanes in order: kick → snare → timekeeper → other keeper → toms → cymbals → crash
                       (each lane: propose candidates with an algorithm → score with shared fitness → lay out over bars)
                 └─► enforcePlayability (two hands, two feet)
                                                     │
finalize: velocities, swing, humanize, interference field, analysis ─► MIDI events ─► .mid / WebAudio preview
                                                     │
harmony (per part, over the finished drums):  key · scale · tuning ─► progression ─► bass (kick) ─► melody ─► rhythm section (snare / hats)
                 └─► pitched events share the drums' swing and humanize ─► pitched MIDI tracks (pitch bend for microtones)
```

Generation is a pure function of the settings and the seed (`generateRhythm(cfg)` in [generate.js](src/engine/generate.js)), so the same settings always produce the same rhythm. This includes the automatic meter, which is drawn from the styles' suggestions with the seed. The overall shape, in which rule-driven generators propose material and a selection step keeps what fits, is the generate-and-test approach of early algorithmic composition (Hiller & Isaacson 1959).

## 2. Time model

### 2.1 Metric hierarchy

| Level | Name | Example in 4/4 |
|---|---|---|
| sub-beat | **tatum** | one grid cell: 1/16, 1/24 (triplets) or 1/32 |
| beat | tactus | quarter note; in compound meters (6/8, 12/8) a dotted quarter |
| bar | measure | may be additive, e.g. 7/8 = 2+2+3 |
| over-beat | hypermeter | 4-bar phrases; also where polymetric lanes realign |

The term *tatum* (the smallest regular pulse a listener infers) is Bilmes's (1993). The beat level follows the usual tactus definition, and additive ("non-isochronous") meters such as 2+2+3 follow London (2012).

[meter.js](src/core/meter.js) turns a meter string into `barLen` (tatums per bar), `beatStarts`, `beatLens` and a **metric weight** per tatum. The weights are a metrical grid in the sense of Lerdahl & Jackendoff (1983), where deeper levels of the hierarchy give more weight; the ordering of downbeat, then beats, then subdivisions matches the goodness-of-fit ratings measured by Palmer & Krumhansl (1990). The downbeat is heaviest, then beat starts, then recursive subdivisions: groups of 3 split into three parts, even groups into two halves, and odd groups into 2s with a closing 3. In meters with an even number of beats (four or more), the mid-bar beat gets an extra boost. Weights are normalised to 0–1. They drive syncopation scoring, accents, velocity and the interference field. The exact numbers are this project's choice rather than values taken from either source.

Accepted forms: `auto` (the default; see §3.1), `4/4`, `5/4`, `12/8`, additive `7/8 (2+2+3)`, fractional `3.5/4`, and any denominator from 1 to 64. With no grouping given, x/8 and finer meters are grouped in 3s when the numerator is a multiple of 3, otherwise in 2s with a closing 3. Meters with a numerator divisible by 3 and greater than 3, over a denominator of 8 or more, are treated as **compound**.

### 2.2 Irrational meters

A 1/17 note is a 1/16 note played 17/16 faster. The grid is built on the largest power-of-two `unit` that is at most the denominator and that the grid resolution can express. Playback runs at `playTempo = tempo × den/unit`. Examples:
- 9/17 at ♩=100 is laid out as 9/16 and played at ♩=106.25.
- 7/10 is laid out on a 1/8 grid sped up ×1.25.

A bar therefore lasts exactly `num/den` whole notes at the quarter-note tempo you typed; the fuzz test checks this. Fractional numerators become the equivalent whole meter (`3.5/4` → `7/8`); anything finer than 1/16 of a beat is rounded.

Note values that don't divide the whole note by a power of two were proposed by Cowell (1930), and "irrational" time signatures of this kind appear in the music of Ferneyhough and Adès, among others. Treating x/17 as x/16 at a faster tempo is a fixed metric modulation: the tempo relationship stays constant for the whole piece.

### 2.3 Hypermeter

`barWeight` gives bar 0 of a part full weight, every 4th bar 0.85, even bars 0.7 and odd bars 0.5. It scales downbeat velocity so that phrases breathe. The idea that bars group into strong and weak "hypermeasures" is Cone's (1968); Lerdahl & Jackendoff (1983) extend the metrical grid above the bar in the same way. The particular weights are this project's choice.

## 3. Inputs

### 3.1 Style and description → parameter vector

The song is described in two layers:
- The **style** is set by a preset (e.g. `metal`, `baroque`, `gregorian chant`) or typed in the Style box. Presets are styles only. They don't fix a meter or tempo, and loading one keeps your parts and your description.
- The **description** changes the style. It is blended on top of the style at 1.3× weight, so `swing` over a `metal` style gives swung metal, and `jazz` over `metal` lands between the two. The description isn't a replacement for the style.

The description applies as you type (after a short pause), on Enter, and when you leave the box.

**Meter, tempo and grid** are on *auto* by default:
- A time signature or bpm written in either layer wins: `metal in 7/8`, `5/4`, `7/8 (2+2+3)`, `180 bpm`.
- Otherwise the styles decide. Each genre or era suggests weighted time signatures, drawn per seed: tribal → 7/8 (2+2+3), 12/8, 6/8 or 5/4; passacaglia and waltz → 3/4; jig and celtic → 6/8; makam → 9/8 (2+2+2+3); math → 7/8, 5/4 or 11/8; most rock and metal → 4/4. The tempo is the average of the drum and harmony styles' tempo hints.
- The grid is 1/16 on auto.
- While any lane is locked, an automatic meter stays put, so locked material isn't lost when the seed changes.

Typing a value in the Tempo, Meter or Grid field overrides auto; clearing the field returns it to auto. Meter-feel descriptors `waltz`, `jig`, `compound` and `odd time` exist mainly to steer the automatic meter. Settings and presets from before this change are migrated: their description becomes the style.

[descriptors.js](src/core/descriptors.js) reads both layers as phrases. For example, `fast metal with VERY heavy double bass, no ghosts, 180 bpm` is read as:
- Multi-word phrases and synonyms map to named descriptors. For example, `doom metal` → `doom`, `funeral march` → `funeral`, `depressive` → `dreary`.
- Emphasis multiplies a phrase's weight: `very`, `extremely`, `lots of`, `!` and ALL CAPS scale it up; `slightly` and `a bit` scale it down. A dynamics word in front of a phrase (`heavy double bass`) also scales it.
- Negation (`no`, `not`, `without`, `less`) reflects the descriptor's values about the base.
- `120 bpm` sets the tempo and `7/8` the meter (when those are on auto); `density=0.7` overrides a parameter directly.

Descriptors are blended as a weighted average. Each has a weight `_w`:
- Genres: 0.7, so they set the scene.
- Specific features such as `double bass`, `toms`, `snare rolls` and `lulls`: 2.5, so they aren't averaged away.
- Everything else: 1.

Part descriptions are blended on top of the style and song description at 1.5× weight.

| Parameter | Effect |
|---|---|
| density, syncopation | fitness targets for hit count and off-grid weight |
| tension | divergence target: how much a lane should avoid coinciding with the rest |
| polymeter, polyrhythm, phasing | chance of lane cycles ≠ bar, k-against-n timekeepers, bar−1 accent cycles |
| mutation | bar-to-bar variation and CA adoption rate |
| ghost, fills, tomUse, blast, doubleKick, gallop, fourFloor, halftime | specific kit behaviours |
| march, lull | funeral-march snare rolls; bars where the kit drops out and toms carry |
| rideBias, bell, cymbalAccents, sidestick | timekeeper choice and cymbal activity |
| swing, dynamics, humanize, feet, hands | performance rendering (§7) |
| downbeat | how strongly the kick anchors beat 1 and the chance of a crash at part starts |
| `algos` | per-algorithm weights used when a lane picks its generator (§4.9) |

The UI groups the descriptors by type (genre, kick and feel including the meter feels, amount, dynamics, texture) and shows a **Heard** line under each box with what was understood and which words were ignored. In the descriptor list, chips lit by the style rather than the description have a dashed border. Clicking a chip adds it to the description. Clicking a lit chip removes it from whichever layer holds it.

### 3.2 Parts and roles

A rhythm is a set of parts played in order and looped. Each part has a name, a length in bars, a role, an optional description and an optional tension override. [applyRole](src/core/descriptors.js) adjusts the parameters for the role:

| Role | Behaviour |
|---|---|
| `groove` | Fresh generation; becomes the **motif** for later parts |
| `variation` | Replays the motif with mutations that increase towards the end of the part |
| `contrast` | Tension +0.3, polymeter/polyrhythm/syncopation up, timekeeper swaps (hi-hat ↔ ride) |
| `build` | Density +0.15, earlier bars thinned progressively, full crescendo snare-roll fill at the end |
| `breakdown` | Half-time, density ×0.6, locked to downbeats, more cymbal accents, blasts mostly removed |
| `fill` | Replays the motif with a full-length fill at the end |

### 3.3 Lane specs

Each of the seven lanes (kick, snare, hi-hat, ride, toms, crash, other cymbals) can have its own spec, parsed by [lanespec.js](src/core/lanespec.js). Each clause tries the strict syntax first, then plain English.

- **Deterministic patterns:** `grid 1/8`, `on 1 3 2&`, `euclid 5/16 rotate 2`, `group 3/16 from each 1`, `group 3+3+2`, `poly 3:2`, a literal pattern (`x..x.X.g`), `gallop`.
- **Algorithm choice:** `ca 90`, `crystal`, `lsystem`, `evolve`, `packing`.
- **Cycle length:** `cycle 5/16` makes a polymetric lane.
- **Relationships:** `lock kick`, `interlock snare`, `answer toms`, `free`, or `follow the kick`, `between the snare`.
- **Behaviour:** `backbeat`, `halftime`, `ghosts 0.6`, `blast`, `double bass`, `accent &`, `open 4&`, `velocity 100`, `loud`/`soft`, `off`.
- `auto` (or empty) leaves the lane to the song description.

## 4. Algorithms

Every algorithm acts as a **proposer**. A single shared fitness function (§4.8) chooses among the candidates. This is how independent generators produce lanes that fit together.

### 4.1 Euclidean rhythms (Bjorklund)

[euclid.js](src/algorithms/euclid.js) implements Bjorklund's algorithm. `bjorklund(k, n)` spreads k onsets as evenly as possible over n steps, giving E(k, n), and `rotate` produces all rotations.

Bjorklund (2003) designed the algorithm to spread neutron-source timing pulses evenly. Toussaint (2005) showed that it computes the same structure as Euclid's greatest-common-divisor algorithm (*Elements*, Book VII) and that its outputs, which he called **Euclidean rhythms**, include many traditional timelines. These patterns are the **maximally even sets** of Clough & Douthett (1991). Their structural properties are analysed by Demaine et al. (2009) and Gómez-Martín, Taslakian & Toussaint (2009), and treated at book length by Toussaint (2013). The code uses the usual pair-merging formulation of the algorithm.

How it's used:
- Proposals of E(k−1…k+1, n) are generated in every rotation, with k taken from the target density.
- An explicit `euclid k/n` spec picks the best-fitting rotation.
- It is the fallback whenever a proposer produces nothing.

**Timelines** are a table of named Euclidean timelines, with names as given by Toussaint (2005):

| Pattern | Name |
|---|---|
| E(3,8) | tresillo |
| E(5,8) | cinquillo |
| E(7,12) | West African standard bell |
| E(4,9) | aksak |
| E(3,7) | ruchenitza |
| E(5,16) | bossa nova necklace |
| E(7,16) | samba necklace |
| E(5,12) | Venda clapping |
| E(5,9) | agsag-samai |
| E(9,16) | Central African necklace |
| E(4,12) | fandango clapping |
| E(5,6) | york-samai |

A "necklace" is a rhythm whose traditional form is a rotation of the Euclidean pattern; the generator searches all rotations anyway. When `bell` > 0.6, the ride plays a timeline. If the timeline doesn't divide the bar, it either runs as its own cycle (polymeter) or is rescaled to the bar.

The idea of a timeline that the ensemble orients around, with interlocking parts filling each other's gaps, comes from ethnomusicology. Sources are Arom (1991) on Central African polyphony and polyrhythm, Pressing (1983) on the structure of timelines across musical cultures, and Agawu (2006) on the West African standard pattern. The generator only borrows these structural principles; it doesn't model any particular tradition.

### 4.2 Packing

[packing.js](src/algorithms/packing.js) covers three techniques:
- **Compositions:** partition a cycle into groups of 2, 3, 4 or 5, e.g. 16 = 3+3+3+3+2+2. A feasibility table ensures every choice can complete. Group sizes are weighted by density, syncopation and tension. Hits go at group starts (plus group ends at higher density). This is the basis of djent and math-rock accents, and the same additive principle underlies aksak meters (London 2012).
- **Restart groups:** `group 3/16 from each 1` places groups of 3 sixteenths that restart at every bar or beat.
- **Rhythmic tiling canons:** `tile(motif, n)` is a backtracking search for translations of a motif that cover Z_n exactly once. Toms use it to build interlocking parts, with one tom voice per translate. In the theory of rhythmic canons, the motif and its set of translations are *complementary*, so their direct sum is Z_n (Vuza 1991–1993; surveyed by Andreatta 2011 and Amiot 2011). The search is a plain exact-cover backtracking search (see Knuth 2000 for the general problem). It finds tilings for the fixed set of small motifs used here; it doesn't construct Vuza canons.

### 4.3 L-systems

[lsystem.js](src/algorithms/lsystem.js) provides three things. L-systems are parallel string-rewriting systems introduced by Lindenmayer (1968) to model plant growth and developed by Prusinkiewicz & Lindenmayer (1990); Prusinkiewicz (1986) first applied them to generating musical scores.
- **Span-subdividing L-system** (`lsysRhythm`): a span `A` rewrites into equal children, such as `AA`, `AR`, `RA`, `AAA` or `ARA`, or terminates as a hit `H`. Odd spans split into 2s and a 3. The rule weights depend on density and syncopation, and deeper hits are quieter. The result is hierarchical, self-similar phrasing. It is used for lane proposals and for every fill, and the derivation trace is shown in the analysis. This stochastic, length-aware rule set is the project's own design, built on the standard formalism.
- **Voice melody** (`voiceMelody`): a small L-system over tom indices. It gives fills and tom grooves self-similar pitch contours.
- **Fibonacci word**: the rewrite system A → AB, B → A (Berstel 1986), used by the crystal generator.

### 4.4 Cellular automata

[ca.js](src/algorithms/ca.js) runs elementary 1D cellular automata with wrap-around: one row is one cycle and one cell is one tatum. Each bar is the next generation, but a cell only adopts its new state with probability `mutation`, which gives slow, hypnotic drift. If a row dies or becomes too dense, it resets to the seed row. The probabilistic adoption and reset are the project's additions, to keep the patterns musically usable.

Rules are numbered by Wolfram's (1983) scheme: the 8-bit rule number lists the next state for each 3-cell neighbourhood, which is exactly what `caStep` decodes. Using CA rows as successive bars follows a long line of generative-music practice (Miranda 2001; reviewed by Burraston & Edmonds 2005).

The seed row comes from a Euclid or L-system proposal. The rule is chosen by descriptor or parameters:

| Rule | Character | Chosen when |
|---|---|---|
| 90, 150 | fractal (rule 90 draws the Sierpiński triangle) | `fractal` |
| 30, 45 | chaotic | `chaotic`, tension > 0.75 |
| 110, 54 | complex (rule 110 is Turing-complete; Cook 2004) | default pool |
| 184 | flowing (the single-lane traffic model; see Nagel & Schreckenberg 1992, which reduces to rule 184 at maximum speed 1) | `hypnotic`, low mutation |
| 60, 102 | shifting | low mutation |

The character labels follow Wolfram's (1983) classification informally.

### 4.5 Crystal generation

[crystal.js](src/algorithms/crystal.js) produces patterns that are ordered but never exactly repeat. Physical quasicrystals were discovered by Shechtman et al. (1984); the mathematics of aperiodic order, including the cut-and-project construction, is covered by Baake & Grimm (2013). Only the 1D sequences are used here.
- **Sturmian / cut-and-project words:** a hit occurs when `floor((i+1)α + ρ)` increments, giving a mechanical (Sturmian) word (Morse & Hedlund 1940; Lothaire 2002, ch. 2). The irrational α nearest the target density is chosen from 1/φ, 1/φ², √2−1, 1/e, 1/π and others. A rational α = k/n gives a maximally even pattern, i.e. a rotation of a Euclidean rhythm (Clough & Douthett 1991; Gómez-Martín, Taslakian & Toussaint 2009). An irrational α gives a 1D quasicrystal.
- **Fibonacci words:** hits on the letter `B` (density about 0.382) or `A` (about 0.618). The Fibonacci word is the standard example of a Sturmian word (Berstel 1986).
- **Nucleation and growth:** seed hits are placed on strong metric positions. They then grow by lattice translation (by the beat length, 3 or 5) or by mirror symmetry within the bar, until the target density is reached. This borrows only the *metaphor* of crystal nucleation; it is the project's own heuristic, not a physical model.

A crystal lane has a cycle equal to the whole part, so it doesn't repeat inside the part.

### 4.6 Genetic algorithm

[genetic.js](src/algorithms/genetic.js) is a standard generational genetic algorithm (Holland 1975; Goldberg 1989). It evolves a population of 36 for 45 generations:
- **Selection:** tournament of 3 (Goldberg & Deb 1991), with the top 4 kept unchanged (elitism).
- **Crossover:** whole beats are swapped between parents.
- **Mutation:** individual hits are flipped, and occasionally a hit is nudged one tatum.
- **Protected positions** (e.g. the kick on beat 1) are always kept.

The population is seeded with the best Euclid, L-system and packing proposals, so the GA acts as a refiner. It also creates displaced backbeats: the snare evolves against the kick, with a prior pulling it back towards the plain backbeat. Evolving drum rhythms against a fitness function goes back at least to Horowitz (1994); Burton & Vladimirova (1999) survey genetic techniques for musical sequences. Here the fitness is the shared function of §4.8 rather than user ratings.

### 4.7 Interference and consonance

[interference.js](src/algorithms/interference.js) treats rhythmic realignment as an *analogy* to acoustic beating. Two tones of nearly equal frequency produce a slow pulse at |f1 − f2| (Helmholtz 1885). Likewise, two lanes with periods `a` and `b` realign every `lcm(a, b)` tatums. Treating rhythm and pitch as one continuum of periodicity goes back to Cowell (1930) and Stockhausen (1959). Near-equal periods that drift slowly in and out of phase are Reich's (1968) "phasing". The analogy is used for design and analysis only; nothing here is an acoustic model.
- **Tenney height** `log2(a·b)`, with the ratio reduced, is Tenney's harmonic distance (Tenney 1983). It scores the consonance of a ratio: 3:2 is low, 15:16 is high. Applying it to rhythmic ratios is this project's extension. When a lane goes polymetric (`chooseCycle`) or a timekeeper plays k-against-n (`choosePoly`), the ratio is weighted towards a target height of `3 + 4.5·tension`, so higher tension picks more dissonant ratios. Phasing chooses `barLen ± 1`.
- **Interference field:** at each tatum, the hit strengths of the lanes are summed, weighted by lane (kick and snare 1, toms 0.8, cymbals 0.7, ride 0.4, hi-hat 0.3), then by metric weight, and normalised. Peaks of the field get crashes (§5) and extra velocity (§7). The field is drawn as a strip under the grid. The field and its weights are the project's own heuristic.
- **`beatFrequency`** reports, for every polymetric lane, its rate, the bar rate, the beat frequency in Hz, the realignment period in tatums, bars and seconds, the ratio and its Tenney height. These appear in the analysis panel as "Oscillators & beating".

### 4.8 Shared fitness

`makeFitness` in [score.js](src/engine/score.js) scores a candidate pattern over its cycle. Starting from zero:
- −4 × |hit density − target density|
- −2.5 × |mean off-beat weight − target syncopation|
- For each relationship to an earlier lane, using that lane folded onto the candidate's cycle:
  - `lock`: + coincidence
  - `interlock` / `avoid`: − coincidence
  - `answer`: − hits within one tatum of the reference
- **Tension term:** − |coincidence with all earlier lanes − 0.6·(1 − tension)|. Low tension pulls lanes together; high tension pushes them apart.
- **Minimum gap:** −0.7 per pair of hits closer than the lane's minimum interval in seconds, including across the cycle boundary.
- **Anchors:** − weight if an anchor (e.g. kick on 1, weighted by `downbeat`) is missing.
- **Prior:** + similarity to a reference pattern (used for displaced backbeats).

The top 3 candidates are sampled with probabilities 0.6, 0.25 and 0.15, so different seeds give different but valid results.

The syncopation term is a simple metric-weight measure: the mean of (1 − weight) over a pattern's onsets. It belongs to the family of weight-based syncopation measures that starts with Longuet-Higgins & Lee (1984) and is compared by Gómez et al. (2005), but it is simpler than either; it doesn't model note-to-rest relationships or note-to-beat distance. The remaining terms and coefficients are the project's own.

### 4.9 Algorithm selection

When a lane isn't forced to an algorithm, it draws one with probability proportional to the descriptor's `algos` weight multiplied by a per-lane suitability factor. For example, toms favour Euclid and packing, and cymbals favour packing. Base weights: Euclid 1, genetic 0.7, packing 0.6, L-system 0.6, CA 0.3, crystal 0.3. Descriptors add to them; for example, `crystalline` adds +3 to crystal and `hypnotic` adds +2 to CA.

## 5. Lane generators

Lanes are generated in a fixed order. Each one sees the lanes before it ([lanes.js](src/engine/lanes.js)).

| Lane | Generation |
|---|---|
| **Kick** | Steady modes first: constant double bass (≥ 0.75, subdivided to stay above 55 ms per stroke), gallop (`x.xx` per beat) or four-on-the-floor. Otherwise a fitness-chosen pattern that interlocks with the snare and is anchored on beat 1, with optional double-kick bursts on single beats. Half-time reduces density. |
| **Snare** | Backbeat on even beats, or a single hit mid-bar in half-time. At high syncopation, a GA-displaced backbeat. At high tom use plus sidestick, a rim/sidestick timeline. Then ghost notes on weak tatums, more likely next to accents. With `march`, crescendo rolls (every tatum, or every other tatum if strokes would be closer than 60 ms) swell into a backbeat accent over 1–2 beats. |
| **Timekeeper** (hi-hat or ride, chosen per rhythm by `rideBias`) | Ride timeline (bell ≥ 0.6), a k-against-n polyrhythm, or a grid of half, quarter, 8th or 16th notes depending on density, with a minimum of 65 ms between strokes. Accents follow metric weight or go off-beat. Open hats go on late off-beats. Phasing applies an accent cycle one grid step shorter than the bar, which realigns every `lcm` bars. |
| **Other keeper** | Hi-hat: foot pedal on the beat or on the "&". Ride: occasional bell pattern locked to the kick. |
| **Toms** | Only when `tomUse` is high enough. Either a tiling canon or a fitness-chosen pattern that interlocks with kick and snare, voiced by an L-system melody (floor tom on strong positions). |
| **Other cymbals** | China or splash accents locked to the kick, with probability set by `cymbalAccents`. |
| **Crash** | Structural: start of the part, every 4 bars, and up to one crash per 2 bars on interference-field peaks, at least a bar apart. In blast bars it often lands on every beat. |

Part-level plans in [fills.js](src/engine/fills.js) are applied on top of the lanes:
- **Fill:** in the last 1–2 beats, or the whole last bar for `fill`/`build` roles. An L-system rhythm on a grid playable by alternating hands (≥ 50 ms), voiced snare → toms by melody, with kick under strong hits. Everything else clears except hi-hat pedal on the beats. `build`, and `march` at random, turn it into a crescendo snare roll.
- **Blast:** per-bar chance of a traditional, hammer or bomb blast, subdivided until playable.
- **Build:** earlier bars of the part are thinned progressively so the part grows towards the end.
- **Lull:** chosen bars (never the first, never a fill bar, at most half the part) keep the kick and crash on 1, keep the timekeeper on beat starts at 70% strength, and keep snare rolls. Everything else drops; toms add floor-tom pulses if they were silent.

## 6. Alignment: lanes, parts and the loop

This is the core of how the software keeps independently generated material coherent.

**Between lanes (vertical alignment)**
1. **Conditional generation.** Each lane is scored against the lanes already generated, using lock, interlock or answer relationships and the tension term (§4.8). Defaults:
   - kick interlocks with snare
   - snare interlocks with kick
   - toms interlock with kick and snare
   - cymbals and bell lock to the kick

   A lane spec can override these.
2. **Folding.** A reference lane is folded onto the candidate's cycle, so a 5/16 polymetric lane can still be scored against a 4/4 kick.
3. **Over-beat rule.** Polymetric lanes restart at every 4-bar phrase boundary, so they realign with the bar, unless tension is above 0.65 or the lane is a crystal. When a lane is allowed to run free, the analysis panel reports when it realigns.
4. **Playability** (§7.1) removes collisions a drummer couldn't play, by priority.

**Between parts (horizontal alignment)**
1. **Motif.** The most recent `groove` part is the motif. `variation` and `fill` parts copy the motif's lanes bar by bar, before any fills, cycling through the motif's bars, then apply mutations that increase towards the end of the part (fewer on the timekeeper). Sections therefore sound related rather than freshly random.
2. **Roles** change the parameters in controlled directions (§3.2) instead of starting from scratch.
3. **Phrase endings.** Fills land at the end of a part. A part that follows a fill always starts with a crash. If the last part ends in a fill, a crash is added at the top of the first part, so the loop resolves into itself.
4. **Lulls and builds** shape energy inside a part without breaking its grid.

**Across re-generations (stability)**
- Every lane in every part draws from its own seeded random stream (`seed:part:lane:salt`). Re-rolling one lane bumps only its salt, and the other lanes are copied unchanged from the previous result. The fuzz test checks this.
- **Locked** lanes, including any lane you edit by clicking cells, are kept note for note while the rest regenerate around them, as long as the meter, grid and part lengths are unchanged. Saved presets store locked lanes, so they reload exactly.

## 7. Performance rendering

### 7.1 Playability

[playability.js](src/engine/playability.js) enforces two rules.

**Minimum interval per lane**, at the current tempo:

| Lane | Minimum interval |
|---|---|
| Snare, toms | 45 ms |
| Hi-hat | 50 ms (pedal excluded) |
| Ride | 60 ms |
| Kick | 100 ms, or 50 ms with double kick |
| Crash | 120 ms |
| Other cymbals | 100 ms |

When two hits are too close, the weaker one goes.

**Two hands per tatum.** Hi-hat (stick) and ride never sound together; the non-timekeeper one is dropped. When more than two hand hits fall on the same tatum, the lowest-priority ones are dropped, from highest to lowest priority:

crash > snare > toms > other cymbals > ride bell > ride > snare ghost notes ≈ hi-hat

The timekeeper gets a small bonus, and locked or typed lanes a large one. Snare rolls also clear the other hand lanes (hats, ride, toms, other cymbals) under them, because both hands are busy.

These limits are engineering heuristics, not measured values. For context, Fujii et al. (2009) measured single-hand tapping in drummers, including the "world's fastest drummer". The 45 ms limit per lane assumes the hands alternate, so each hand plays at most about half that rate.

### 7.2 Velocity and timing

In [finalize.js](src/engine/finalize.js), each hit gets a reproducible random stream from `seed:lane:tatum`.
- **Velocity:**
  ```
  base(lane) × (0.55 + 0.45·strength) × (1 − 0.22·dynamics·(1 − metric weight)) + 14·dynamics·field − 4
  ```
  This is then scaled by the lane spec gain and the `feet`/`hands` gain (0 → ×0.6, 0.5 → ×1, 1 → ×1.3), with Gaussian jitter of ±6·humanize. Ghost notes sit at about 24–46 and hi-hat pedal at 55–75.
- **Swing** delays the off-beat 8th (or 16th when density is above 0.65) by up to a third of its length. It is skipped on the triplet grid, which already swings. Real swing ratios vary with tempo (Friberg & Sundström 2002); the fixed scaling here is a simplification.
- **Humanize** adds Gaussian timing offsets, scaled per lane: tight on the kick, looser on the hi-hat.

Shaping velocity by metrical position and phrase position follows the same principle as the KTH performance rules (Friberg, Bresin & Sundberg 2006), though the formula above is the project's own. The timing jitter is independent (white) noise, which is a simplification: human drumming fluctuations are long-range correlated (1/f-like), and listeners prefer that (Hennig et al. 2011).

### 7.3 Analysis

The UI shows the interference strip and four cards:
- **Parts:** target tension against actual alignment, the timekeeper, hits removed for playability, and the fill and blast plans.
- **Lanes:** the algorithm and details per lane and part.
- **Oscillators & beating:** §4.7.
- **Alignment matrix:** coincidence for every pair of lanes.

## 8. Harmony and melody

The rhythm is the foundation. Once the drums of every part exist, [harmony/generate.js](src/harmony/generate.js) builds four layers per part, in this order:

1. **Chords** (the progression) on a harmonic-rhythm grid of bars and beats.
2. **Bass**, whose onsets come from the kick lane (or from the beat, for walking and continuo lines).
3. **Melody**, generated over the chords.
4. **Rhythm section** (comping), whose onsets come from the snare, crash and timekeeper lanes. It is generated after the melody so that organum can shadow it.

Like the drums, harmony is a pure function of the settings and the seed. Each layer has its own seeded fork, so re-rolling one leaves the others alone. Pitched notes share the drums' swing and humanize offsets, so the band stays locked to the kit. Editing a drum cell re-runs the unlocked voices, so the bass follows the new kick.

### 8.1 Styles, eras and descriptors

The style and the song description are each read by two vocabularies. The drum vocabulary is described in §3.1. The harmony vocabulary, in [harmony/styles.js](src/harmony/styles.js), uses the same phrase reader, with emphasis, softening and negation. A word only counts as unrecognized if neither vocabulary knows it. The **Heard** line marks harmony terms with ♪.

Harmony uses the same layering as the drums. The description modifies the style at 1.3× weight, and the Harmony & melody panel's own description adds a third layer on top (1.2×). Part descriptions apply to harmony too, with the same 1.5× weight they have for drums. "Swing" is a feel, not a harmony style: it swings the pitched voices along with the drums but leaves the chords alone, so a metal style stays metal. Each harmony style also suggests time signatures for the automatic meter (§3.1). There is also a `waltz` style (3/4, oom-pah bass and block chords).

| Group | Styles |
|---|---|
| Early | gregorian chant, organum, medieval, renaissance, chorale/hymn |
| Baroque & classical | baroque, passacaglia, classical, romantic |
| Modern | cinematic, impressionist, minimalist, serial (twelve-tone), ambient |
| Jazz & blues | blues, jazz, bebop, modal jazz, bossa nova, gospel, soul, lo-fi, funk |
| Popular | pop, rock, hard rock, punk, metal, thrash, death, black metal, doom, djent, prog, post-rock, country, folk, reggae, disco, EDM, trance, synthwave, hip-hop |
| World | flamenco, klezmer, celtic, maqam, makam, raga, gamelan, japanese, chinese, afrobeat, latin, tango |
| Mood | dark, bright, sad, mysterious, tense, dreamy, epic, exotic |
| Harmony features | power chords, sevenths, extended, chromatic, diatonic, pedal point, drone, modulating, fast/slow changes, vamp, open/close voicings, quartal, parallel, anticipations, blue notes, 12-bar blues, andalusian, pachelbel, lament, ii-V-I |
| Voices | walking / pedal / octave / root-fifth / eighth-note / sub bass, continuo, no bass; arpeggios, pads, strummed, stabs, tremolo, chugs, alberti, block chords, skank, comping, no chords, unaccompanied; chant, lyrical, riffs, sequences, ornamented, catchy, stepwise, angular, busy/sparse/high/low melody, no melody |
| Tuning | microtonal, equal temperament, just intonation, quarter tones, meantone, well-tempered, pythagorean, 19/22/31/53-EDO |

Every scale is also a descriptor, e.g. "dorian", "harmonic minor", "phrygian dominant", "hirajoshi" or "maqam bayati". A key can be named in the text: "in D minor", "key of F#", "A dorian", "Bb phrygian dominant". Many artists and sub-genres are synonyms, e.g. "bach" → baroque, "debussy" → impressionist, "grunge" → hard rock + dark, "drum and bass" → EDM.

Each style sets numeric parameters and weighted choices:
- **Numeric parameters:** harmonic rhythm; 7th, extension, power-chord and sus probabilities; chromaticism; cadence strength; pedal; parallel planing; voicing spread and size; quartal voicing; anticipation; densities; melodic step ratio, range, register, syncopation, repetition, ornament rate; reciting-tone pull; legato; blue notes; dissonance tolerance; modulation.
- **Weighted choices:** progression grammar, scale, bass style, rhythm-section style, melody style, tuning, preferred keys, ornament types, and GM programs for each voice.

They blend as weighted averages, the same way the drum descriptors do. Explicitly named scales and keys win outright. Voice and grammar choices are drawn with squared weights, so a style's signature choice (a walking bass for jazz, chugs for metal) dominates.

Each voice also has a spec box, like a lane spec. It takes a style word plus modifiers, e.g. bass `walking`, comping `arpeggio busy`, melody `riff high` or `follow snare`. The **Chords** box takes a chord chart, which is cycled over the chord slots:
- Roman numerals relative to the major scale on the tonic: `i bVI III bVII`, `ii7 V7 Imaj7`, `V7/V`, `ii°`.
- Chord symbols: `Am F C G`, `F#m7b5`, `C/E`.
- Scale degrees `1`–`7`.

When the key is on auto, the chart's first chord sets it.

### 8.2 Progressions

[harmony/progression.js](src/harmony/progression.js) holds 37 grammars, including functional, hymn, baroque (circle-of-fifths sequences, the lament bass, Pachelbel), classical, romantic (bVI, Neapolitan, chromatic mediants), cinematic, pop, rock, punk, metal (phrygian bII, tritone bV), doom, djent, 12-bar blues, jazz (ii-V-I, rhythm-changes fragments), bossa, gospel, soul, lo-fi, funk, reggae, country, folk, celtic, EDM, synthwave, modal vamps, minimalist, impressionist (planing), renaissance and medieval (modal, open fifths), andalusian, klezmer (freygish), drone and twelve-tone row.

Each grammar has phrase templates for the major and minor mode families (decided by the scale's third), plus cadence preferences. Roman numerals are measured against the major scale on the tonic, so minor keys write `i bIII iv v bVI bVII`. Plain numbers are diatonic chords of whatever scale is active, built by stacking every other scale step. That works for any scale, including microtonal ones, where it yields neutral thirds.

**Harmonic rhythm.** `hr` is log₂ of bars per chord, from 4 chords per bar to 1 chord per 4 bars. Chord slots fall on bar lines, or on beat boundaries in additive meters.

**Cadences.** With a probability set by cadence strength, a part ends on an authentic, plagal, half, deceptive, rock (bVII–I), "Mario" (bVI–bVII–I), phrygian (bII–I), modal (VII–I), double-leading-tone or jazz (ii–V–I) cadence. Builds, fills and the last part end on a turnaround instead (for example ii–V, bVI–bVII or V7), so the loop leads back to the top. Renaissance minor may end on a Picardy third.

**Substitutions.** Secondary dominants (V7/x), tritone substitution in jazz, sus chords, sevenths and ninths (diatonic when the chord is diatonic), and power chords. A pedal point holds the tonic, or the dominant in builds.

**Roles.**
- *Variation* reuses the motif part's chords.
- *Contrast* avoids the motif's template and may modulate to IV, V or the relative key.
- *Build* adds density and a dominant pedal.
- *Breakdown* halves the harmonic rhythm.
- *Fill* doubles it.

Functional harmony and cadence types follow standard textbook usage (Piston 1941). Jazz substitutions and rootless voicings follow Levine (1995).

### 8.3 Voices

**Voicing** ([harmony/chords.js](src/harmony/chords.js)). The rhythm section's voicing for each chord is chosen from all inversions and octave placements, plus drop-2 variants, by a cost function:
- total voice movement from the previous voicing (minimal voice leading in the sense of Tymoczko 2011);
- a top-voice term;
- spread against a target width;
- a penalty for close intervals in the low register;
- distance from the register centre.

Power chords are root–fifth–octave. Quartal voicings stack fourths from the third. Comping uses rootless voicings. Planing transposes the previous shape exactly.

**Bass** ([harmony/voices.js](src/harmony/voices.js)) styles:
- *follow:* the kick's onsets (thinned to eighths under double bass), with fifths, octaves and scale-step or chromatic approach notes into the next chord, and kick-anticipated chord changes.
- *chug:* every kick, palm-muted, low root.
- *pedal:* strong kicks, tonic.
- *walking:* every beat, chord tones and steps, with a chromatic approach on the last beat.
- *continuo:* stepwise quarters or eighths toward the next root.
- *octave:* disco/funk, with 16th ghost notes.
- *root-fifth:* oom-pah.
- *sub:* long notes on kicks.
- *eighths:* driving eighths.
- *drone* and *none*.

Bass velocity follows the kick's strength.

**Rhythm section** styles:
- *pad:* changes plus every two bars.
- *block:* every beat.
- *stab:* snare and crash hits.
- *power:* kick plus snare.
- *chug:* kick, open on crashes and changes.
- *strum:* timekeeper hits, with per-string strum offsets.
- *arpeggio* and *alberti:* on an 8th or 16th grid.
- *tremolo:* every 16th.
- *comp:* syncopated, Charleston-weighted, with anticipations.
- *skank:* offbeats.
- *organum:* the melody a fifth or fourth below, optionally doubled at the octave.
- *drone:* open fifth.
- *tanpura:* Pa–Sa–Sa–Sa plucks.
- *none.*

**Melody** works by generate-and-test:
1. **Rhythm.** A phrase rhythm is drawn on a grid (quarters, eighths or 16ths by density). Onset probability mixes metric weight and syncopation. A breath rest is left at the end of each phrase. Riffs take their onsets from the kick and/or snare lane.
2. **Candidates.** Eighteen pitch lines are generated as random walks in scale degrees, steered toward a contour: arch (Huron 1996), rise in builds, fall in fills, or wave. Each line has a step/leap ratio, gap-fill after leaps (von Hippel & Huron 2000), chord tones on strong beats unless dissonance allows otherwise, chromatic passing tones, and bebop approach notes.
3. **Scoring.** Each candidate is scored for chord tones on strong beats, closeness to the target step ratio, avoided large and tritone leaps, limited repeated notes and a single climax placed between 35% and 85% of the phrase. The best candidate is kept.
4. **Form.** Phrases repeat by a form (AABA, ABAC, ABCB or ABCD) chosen by the repetition parameter. Repeats are re-fitted to the current chords, and the last phrase gets a new cadential tail that ends on the tonic or a chord tone.

Special melody styles:
- *chant:* stepwise, unmetred, pulled toward the mode's reciting tone, e.g. the fifth, or the sixth in phrygian (Apel 1958).
- *sequence:* a one-beat or half-bar cell repeated a step lower or higher, Fortspinnung style.
- *arp:* chord-tone cycles.
- *minimal:* a repeated cell with occasional single-note changes.
- *ornate:* lyrical with heavy ornamentation.
- *row:* the twelve-tone row in prime, retrograde, inversion and retrograde-inversion forms (Perle 1962).

Ornaments are carved out of long notes: trills, mordents, turns, and grace notes (a semitone, a scale step, or a quarter tone below when microtones are on). Variations reuse the motif melody with step mutations re-fitted to the chords. Fills end with a scale run into the next downbeat.

### 8.4 Tuning and microtones

Everything is 12-tone equal temperament unless microtones are on. The **Microtones** setting has three values:
- *Only if described* (default): on when the description asks, e.g. "microtonal", "quarter tones", "just intonation", "31-EDO".
- *Off:* always 12-TET.
- *On:* always microtonal.

With microtones off, microtonal scales fall back to a 12-tone relative (maqam bayati → phrygian, slendro → major pentatonic), and a warning says so.

Pitches are float MIDI numbers ([harmony/tuning.js](src/harmony/tuning.js)). Scales are defined in cents. Every scale degree and chord tone is snapped to the nearest pitch of the active tuning:

| Tuning | Basis |
|---|---|
| 12-TET | equal semitones |
| 19, 22, 24, 31, 53-EDO | equal divisions of the octave; 31-EDO approximates quarter-comma meantone, 53-EDO is used for Turkish makam |
| just intonation | 5-limit ratios from the tonic |
| Pythagorean | stacked pure fifths from the tonic |
| quarter-comma meantone, Werckmeister III | historical keyboard temperaments, absolute from C (Barbour 1951) |
| 22 shruti | Indian just scale |
| slendro, pelog | approximate gamelan scales |
| exact | the scale's own cents, no snapping (maqam quarter tones, harmonic series) |

On *auto*, the tuning comes from the style:
- Gregorian chant → Pythagorean
- renaissance → meantone
- baroque → Werckmeister III
- maqam → 24-EDO
- makam → 53-EDO
- raga → shruti or just
- gamelan → exact

Microtonal scales include maqam rast, bayati, saba, sikah and huzam (after Touma 1996), the neutral (Zalzalian) diatonic, slendro, pelog, harmonic series 8–16 and quarter-tone chromatic. With microtones on, blues and rock melodies can bend the minor third to a neutral third (350¢) and the minor seventh to the harmonic seventh (969¢).

In MIDI, each pitch becomes the nearest key plus a pitch-bend offset. The bend range is set to ±2 semitones with RPN 0 at the start of each channel. Notes that need different bends at the same time are spread over a pool of channels: melody 1, 11, 12; bass 2, 13; rhythm section 3–9, 14–16. That is the one-note-per-channel approach MPE uses (MIDI Manufacturers Association 2018). In 12-TET no bends are written and each voice uses a single channel. Use an instrument that responds to per-channel pitch bend, such as a multi-timbral or MPE-capable synth. The WebAudio preview plays the exact frequencies.

### 8.5 Saving and recalling

**Export MIDI** embeds the full state in a sequencer-specific meta event (manufacturer ID 0x7D, "non-commercial"). The state is the settings plus every drum hit, chord and note. **Open MIDI**, or dropping a `.mid` on the page, does one of two things ([io/midiread.js](src/io/midiread.js)):
- **midigen files** come back exactly. The first regeneration keeps every lane and voice from the file. After that, locks behave as usual, so you can keep the drums and re-roll the melody, for instance.
- **Other MIDI files** are imported:
  - The first tempo and meter are used.
  - Markers become parts (a `name (role)` marker restores the role); without markers, the song is split into 8-bar parts.
  - The grid (16ths, triplets or 32nds) is chosen by quantisation error.
  - Channel 10 is mapped to drum lanes through the drum map.
  - Pitch bend and RPN bend range are applied, so microtonal files keep their pitches.
  - Pitched tracks are assigned to bass, rhythm section or melody by track name, then by how often notes start together (chords) and by register.
  - The key is estimated with the Krumhansl–Kessler profiles (Krumhansl & Kessler 1982; Krumhansl 1990).
  - One chord per bar is inferred by template matching, with the lowest note as a root hint.

  Imported material is locked. Voices or drum lanes that the file lacks are generated over it, so a drums-only file gets a band and a melody-only file gets drums and chords.

Saved presets (**Save preset**) store the style, description, auto or fixed tempo/meter/grid, parts, harmony settings, and the exact hits and notes of any locked lane or voice. The built-in examples are styles only (§3.1).

## 9. Using the output with Superior Drummer 3 and other instruments

### 9.1 File format

[midi.js](src/io/midi.js) writes Standard MIDI Files (MIDI Manufacturers Association 1996) with a PPQ of 480. Drum notes are on **channel 10**, the General MIDI percussion channel, with short note lengths (at most half a tatum and at most 60 ticks). Pitched voices carry real durations and a GM program change on their own channels: melody on 1, bass on 2, rhythm section on 3. With microtones on, they use the wider channel pools and pitch bend described in §8.4. Muted lanes and voices are left out.

| Layout | Contents |
|---|---|
| **Track per lane** (type 1) | Track 0: title, tempo, time signature, one **marker** per part (`A (groove)`) and the embedded midigen state. Then named tracks for melody, rhythm section and bass, then one each for kick, snare, hi-hat, ride, toms, other cymbals and crash. |
| **Single track** (type 0) | The same events merged into one track. |
| **Drums only** | Track per lane, without the pitched tracks. |
| **Harmony only** | The pitched tracks, without drums. |

The file name encodes the descriptors, meter, tempo, key and seed, e.g. `doom-funeral-march_9-17_100bpm_c-minor_s4.mid`. The embedded state is ignored by DAWs and synths.

### 9.2 Default note map

The default note numbers are the General MIDI Level 1 percussion key map (MIDI Manufacturers Association 1991). SD3's default input map uses the same numbers for these core pieces, but kits and expansions can differ, so check against Toontrack's documentation for your kit. The map can be edited in the **Drum map** panel, as JSON of `lane → articulation → note`.

| Piece | Note |
|---|---|
| Kick | 36 |
| Snare center / ghost / rimshot / sidestick | 38 / 38 / 40 / 37 |
| Hi-hat closed / open / pedal | 42 / 46 / 44 |
| Toms: rack 1, rack 2, rack 3, floor 1, floor 2 | 48, 47, 45, 43, 41 |
| Ride bow / bell | 51 / 53 |
| Crash 1 / crash 2 | 49 / 57 |
| China / splash | 52 / 55 |

### 9.3 Workflow

1. Pick a preset (a style), change it with the description, and audition it with **Play** (a WebAudio sketch using look-ahead scheduling after Wilson 2013; the real sound comes from SD3). Then lock or edit lanes until it sits right.
2. **Export MIDI.**
   - **Track per lane** is best in a DAW: each drum is its own MIDI track, so you can edit, mute or quantise one piece without touching the others. Route all of them to the same SD3 instance.
   - **Single track** is simplest for dropping onto SD3's own song track, or onto a single DAW track that feeds SD3.
3. **Tempo and meter.** Many DAWs ignore the tempo and time signature in a file that is dragged into an existing project. Set the project to the tempo and signature shown in the app; when they are on auto, they are shown in the Tempo and Meter fields and the Rhythm panel summary.
   - For irrational meters, use the **exported** signature and tempo shown under the tempo field. For example, 9/17 at 100 is written as 9/16 at 106.25. It sounds identical, and SD3 and DAWs can only display power-of-two signatures.
4. **Mapping.** If your SD3 kit or expansion (SDX) uses a different input map, or a piece is silent or plays the wrong articulation, edit the Drum map panel to match the note numbers in SD3's MIDI mapping. Mixed hi-hat openness (e.g. half-open) and per-tom articulations beyond the five voices aren't generated; map them in SD3 if needed.
5. **Dynamics.** SD3 has many velocity layers, so `dynamics`, `humanize`, ghost notes and the `feet`/`hands` balance carry through to the sound. If the kit sounds too uniform, raise dynamics or humanize rather than editing velocities by hand.
6. **Sections.** Part markers show up in DAWs that read MIDI markers and help line the rhythm up with a song. The exported rhythm is one loop of all the parts; repeat or rearrange it in the DAW.
7. **Pitched tracks.** Route melody, rhythm section and bass to any instruments. The GM programs are only suggestions (the instrument picker under each voice changes them). For microtonal songs, use instruments that apply per-channel pitch bend with a ±2 semitone range, or MPE instruments.
8. **Keeping songs.** Keep the exported `.mid` files: **Open MIDI** brings any of them back exactly, ready to tweak. You can also open other MIDI files to build on them (§8.5).

## 10. Code map

| File | Responsibility |
|---|---|
| [core/meter.js](src/core/meter.js) | meter parsing, metric weights, irrational meters, position tokens (`2&`, `3e`, `@5`) |
| [core/descriptors.js](src/core/descriptors.js) | phrase parser (shared with the harmony vocabulary), descriptor table, blending, role adjustments |
| [core/lanespec.js](src/core/lanespec.js) | per-lane language (strict and plain English) |
| [core/drummap.js](src/core/drummap.js) | lanes, articulations, default notes and velocities |
| [core/rng.js](src/core/rng.js) | seeded PRNG (mulberry32) with named forks via a cyrb53-derived string hash (§13) |
| [algorithms/](src/algorithms) | euclid, packing, lsystem, ca, crystal, genetic, interference |
| [engine/score.js](src/engine/score.js) | shared fitness, folding, coincidence |
| [engine/lanes.js](src/engine/lanes.js) | lane generators, layout, motif reuse |
| [engine/fills.js](src/engine/fills.js) | fills, blasts, builds, lulls |
| [engine/generate.js](src/engine/generate.js) | style/description layering, automatic meter, tempo and grid (`resolveSong`), orchestration per part |
| [engine/playability.js](src/engine/playability.js) | limb constraints |
| [engine/finalize.js](src/engine/finalize.js) | velocities, timing (shared swing), analysis |
| [harmony/styles.js](src/harmony/styles.js) | harmony vocabulary: styles, eras, scales, tunings, key phrases, voice specs |
| [harmony/scales.js](src/harmony/scales.js), [harmony/tuning.js](src/harmony/tuning.js) | scales and modes, tunings, pitch space and snapping |
| [harmony/chords.js](src/harmony/chords.js) | chord qualities, Roman numerals, chord symbols, diatonic chords, voicing |
| [harmony/progression.js](src/harmony/progression.js) | grammars, harmonic rhythm, cadences, substitutions |
| [harmony/voices.js](src/harmony/voices.js) | bass, rhythm section and melody generators, ornaments |
| [harmony/generate.js](src/harmony/generate.js), [harmony/finalize.js](src/harmony/finalize.js) | per-part harmony orchestration, locks, snapshots; timed pitched events |
| [io/midi.js](src/io/midi.js), [io/ascii.js](src/io/ascii.js) | MIDI writer (drums, pitched tracks, pitch bend, embedded state) and text grid |
| [io/midiread.js](src/io/midiread.js) | MIDI reader, state recall, foreign import, key finding and chord inference |
| [ui/](src/ui) | app, grid, piano-roll and analysis rendering, WebAudio preview, presets |

Tests:
- `npm test` runs a smoke test that writes and validates sample MIDI files. It checks:
  - the style/description layering (a description modifies a style; meters and tempos come from styles, the text, or explicit settings, in that order of precedence);
  - drum and pitched note counts;
  - the exact round trip of microtonal pitches through pitch bend;
  - exact recall from the embedded state;
  - per-voice assignment on import.
- `node tests/fuzz.mjs` generates 400 random configurations, a third of them with an automatic meter, tempo and grid driven by random styles. They also include random harmony styles, scales, tunings and voice specs. It checks:
  - drum and pitched events;
  - chord validity;
  - that no microtones appear when they are off;
  - lane and voice re-roll isolation;
  - MIDI writing with state round trip;
  - exact bar length in irrational meters.

## 11. Limitations

- One meter and one tempo per rhythm. There is no metric modulation or tempo change between parts.
- On auto, a style that suggests several meters (tribal, doom, folk…) may pick a different one with each **New seed**. Type a meter, write it in the description, or lock a lane to keep it.
- The description modifies the style by weighted blending, so very different styles meet in the middle (metal + jazz) rather than producing a curated fusion genre.
- Open hi-hats aren't choked by the following closed hit or pedal; SD3 handles choking itself.
- No half-open hi-hat, flams, buzz-roll articulation or cymbal chokes. Rolls are individual strokes.
- Hand-edited lanes survive a page reload only when saved in a preset or an exported MIDI file.
- The audio preview is a simple synth meant for checking timing and pitch, not sound.
- Pitch-level "frequency" features (e.g. tuning toms to the ratios of the polyrhythms) aren't implemented.
- Humanization uses independent noise rather than the correlated fluctuations of real players (§7.2).
- Pitched notes can't be edited by hand in the grid; lock, re-roll, change the voice spec, or edit in a DAW and open the file again.
- Harmony is homophonic at heart: there is no independent contrapuntal inner-voice writing (fugue, species counterpoint), only voice-led chords, a bass line and one melody.
- One key per part. Modulation happens between parts (contrast or a key in the part description), not mid-phrase.
- Microtonal pitches use pitch bend, so a receiving instrument must honour per-channel bend; some tunings (just intonation, Pythagorean) are fixed to the tonic, so chords on other degrees keep their historical wolf intervals.
- Importing other MIDI files ignores tempo and meter changes. Voice assignment in single-track files without track names is a heuristic, and a one-note arpeggio may be heard as melody.
- Style settings are informal summaries of common practice, not stylistic analyses (§13).

## 12. References

Agawu, K. (2006). Structural analysis or cultural analysis? Competing perspectives on the "standard pattern" of West African rhythm. *Journal of the American Musicological Society*, 59(1), 1–46. https://doi.org/10.1525/jams.2006.59.1.1

Amiot, E. (2011). Structures, algorithms, and algebraic tools for rhythmic canons. *Perspectives of New Music*, 49(2), 93–142. https://doi.org/10.1353/pnm.2011.0018

Andreatta, M. (2011). Constructing and formalizing tiling rhythmic canons: A historical survey of a "mathemusical" problem. *Perspectives of New Music*, 49(2), 33–64. https://doi.org/10.1353/pnm.2011.0012

Apel, W. (1958). *Gregorian Chant*. Indiana University Press.

Arom, S. (1991). *African Polyphony and Polyrhythm: Musical Structure and Methodology*. Cambridge University Press.

Baake, M., & Grimm, U. (2013). *Aperiodic Order, Vol. 1: A Mathematical Invitation*. Cambridge University Press.

Barbour, J. M. (1951). *Tuning and Temperament: A Historical Survey*. Michigan State College Press.

Berstel, J. (1986). Fibonacci words: A survey. In G. Rozenberg & A. Salomaa (Eds.), *The Book of L* (pp. 13–27). Springer.

Bilmes, J. A. (1993). *Timing is of the Essence: Perceptual and Computational Techniques for Representing, Learning, and Reproducing Expressive Timing in Percussive Rhythm* (Master's thesis). Massachusetts Institute of Technology.

Bjorklund, E. (2003). *The Theory of Rep-Rate Pattern Generation in the SNS Timing System* (SNS ADO Technical Note SNS-NOTE-CNTRL-99). Los Alamos National Laboratory.

Burraston, D., & Edmonds, E. (2005). Cellular automata in generative electronic music and sonic art: A historical and technical review. *Digital Creativity*, 16(3), 165–185. https://doi.org/10.1080/14626260500370882

Burton, A. R., & Vladimirova, T. (1999). Generation of musical sequences with genetic techniques. *Computer Music Journal*, 23(4), 59–73. https://doi.org/10.1162/014892699560001

Clough, J., & Douthett, J. (1991). Maximally even sets. *Journal of Music Theory*, 35(1/2), 93–173. https://doi.org/10.2307/843811

Cone, E. T. (1968). *Musical Form and Musical Performance*. W. W. Norton.

Cook, M. (2004). Universality in elementary cellular automata. *Complex Systems*, 15(1), 1–40. https://doi.org/10.25088/ComplexSystems.15.1.1

Cowell, H. (1930). *New Musical Resources*. Alfred A. Knopf.

Demaine, E. D., Gomez-Martin, F., Meijer, H., Rappaport, D., Taslakian, P., Toussaint, G. T., Winograd, T., & Wood, D. R. (2009). The distance geometry of music. *Computational Geometry*, 42(5), 429–454. https://doi.org/10.1016/j.comgeo.2008.04.005

Friberg, A., Bresin, R., & Sundberg, J. (2006). Overview of the KTH rule system for musical performance. *Advances in Cognitive Psychology*, 2(2–3), 145–161. https://doi.org/10.2478/v10053-008-0052-x

Friberg, A., & Sundström, A. (2002). Swing ratios and ensemble timing in jazz performance: Evidence for a common rhythmic pattern. *Music Perception*, 19(3), 333–349. https://doi.org/10.1525/mp.2002.19.3.333

Fujii, S., Kudo, K., Ohtsuki, T., & Oda, S. (2009). Tapping performance and underlying wrist muscle activity of non-drummers, drummers, and the world's fastest drummer. *Neuroscience Letters*, 459(2), 69–73. https://doi.org/10.1016/j.neulet.2009.04.055

Goldberg, D. E. (1989). *Genetic Algorithms in Search, Optimization, and Machine Learning*. Addison-Wesley.

Goldberg, D. E., & Deb, K. (1991). A comparative analysis of selection schemes used in genetic algorithms. In G. J. E. Rawlins (Ed.), *Foundations of Genetic Algorithms* (pp. 69–93). Morgan Kaufmann. https://doi.org/10.1016/B978-0-08-050684-5.50008-2

Gómez, F., Melvin, A., Rappaport, D., & Touma, H. H. (1996). *The Music of the Arabs* (new expanded ed., L. Schwartz, Trans.). Amadeus Press.

Toussaint, G. T. (2005). Mathematical measures of syncopation. In *Proceedings of BRIDGES: Mathematical Connections in Art, Music and Science* (pp. 73–84). Banff.

Gómez-Martín, F., Taslakian, P., & Toussaint, G. T. (2009). Structural properties of Euclidean rhythms. *Journal of Mathematics and Music*, 3(1), 1–14. https://doi.org/10.1080/17459730902819566

Helmholtz, H. von (1885). *On the Sensations of Tone as a Physiological Basis for the Theory of Music* (A. J. Ellis, Trans.; 2nd English ed.). Longmans, Green. (Original work published 1863)

Hennig, H., Fleischmann, R., Fredebohm, A., Hagmayer, Y., Nagler, J., Witt, A., Theis, F. J., & Geisel, T. (2011). The nature and perception of fluctuations in human musical rhythms. *PLoS ONE*, 6(10), e26457. https://doi.org/10.1371/journal.pone.0026457

Hiller, L. A., & Isaacson, L. M. (1959). *Experimental Music: Composition with an Electronic Computer*. McGraw-Hill.

Holland, J. H. (1975). *Adaptation in Natural and Artificial Systems*. University of Michigan Press.

Horowitz, D. (1994). Generating rhythms with genetic algorithms. In *Proceedings of the International Computer Music Conference (ICMC)*. Aarhus.

Huron, D. (1996). The melodic arch in Western folksongs. *Computing in Musicology*, 10, 3–23.

Knuth, D. E. (2000). Dancing links. In J. Davies, B. Roscoe & J. Woodcock (Eds.), *Millennial Perspectives in Computer Science*. Palgrave. arXiv:cs/0011047.

Krumhansl, C. L. (1990). *Cognitive Foundations of Musical Pitch*. Oxford University Press.

Krumhansl, C. L., & Kessler, E. J. (1982). Tracing the dynamic changes in perceived tonal organization in a spatial representation of musical keys. *Psychological Review*, 89(4), 334–368. https://doi.org/10.1037/0033-295X.89.4.334

Lerdahl, F., & Jackendoff, R. (1983). *A Generative Theory of Tonal Music*. MIT Press.

Levine, M. (1995). *The Jazz Theory Book*. Sher Music.

Lindenmayer, A. (1968). Mathematical models for cellular interactions in development I & II. *Journal of Theoretical Biology*, 18(3), 280–315. https://doi.org/10.1016/0022-5193(68)90079-9

London, J. (2012). *Hearing in Time: Psychological Aspects of Musical Meter* (2nd ed.). Oxford University Press.

Longuet-Higgins, H. C., & Lee, C. S. (1984). The rhythmic interpretation of monophonic music. *Music Perception*, 1(4), 424–441. https://doi.org/10.2307/40285271

Lothaire, M. (2002). *Algebraic Combinatorics on Words* (Ch. 2, Sturmian words, by J. Berstel & P. Séébold). Cambridge University Press.

MIDI Manufacturers Association (1991). *General MIDI System Level 1*. MMA.

MIDI Manufacturers Association (1996). *Standard MIDI Files 1.0* (in *The Complete MIDI 1.0 Detailed Specification*). MMA.

MIDI Manufacturers Association (2018). *MIDI Polyphonic Expression (MPE) Specification*, v1.0. MMA.

Miranda, E. R. (2001). *Composing Music with Computers*. Focal Press.

Morse, M., & Hedlund, G. A. (1940). Symbolic dynamics II: Sturmian trajectories. *American Journal of Mathematics*, 62(1), 1–42. https://doi.org/10.2307/2371431

Nagel, K., & Schreckenberg, M. (1992). A cellular automaton model for freeway traffic. *Journal de Physique I*, 2(12), 2221–2229. https://doi.org/10.1051/jp1:1992277

Palmer, C., & Krumhansl, C. L. (1990). Mental representations for musical meter. *Journal of Experimental Psychology: Human Perception and Performance*, 16(4), 728–741. https://doi.org/10.1037/0096-1523.16.4.728

Perle, G. (1962). *Serial Composition and Atonality*. University of California Press.

Piston, W. (1941). *Harmony*. W. W. Norton.

Pressing, J. (1983). Cognitive isomorphisms between pitch and rhythm in world musics: West Africa, the Balkans and Western tonality. *Studies in Music*, 17, 38–61.

Prusinkiewicz, P. (1986). Score generation with L-systems. In *Proceedings of the International Computer Music Conference (ICMC)*. The Hague.

Prusinkiewicz, P., & Lindenmayer, A. (1990). *The Algorithmic Beauty of Plants*. Springer.

Reich, S. (1968/2002). Music as a gradual process. Written 1968; in P. Hillier (Ed.), *Writings on Music, 1965–2000* (2002). Oxford University Press.

Shechtman, D., Blech, I., Gratias, D., & Cahn, J. W. (1984). Metallic phase with long-range orientational order and no translational symmetry. *Physical Review Letters*, 53(20), 1951–1953. https://doi.org/10.1103/PhysRevLett.53.1951

Stockhausen, K. (1959). …How time passes… (C. Cardew, Trans.). *Die Reihe*, 3, 10–40. (Original work published 1957)

Tenney, J. (1983/2015). John Cage and the theory of harmony. Written 1983; in L. Polansky, L. Pratt, R. Wannamaker & M. Winter (Eds.), *From Scratch: Writings in Music Theory* (2015). University of Illinois Press.

Touma, H. H. (1996). *The Music of the Arabs* (new expanded ed., L. Schwartz, Trans.). Amadeus Press.

Toussaint, G. T. (2005). The Euclidean algorithm generates traditional musical rhythms. In *Proceedings of BRIDGES: Mathematical Connections in Art, Music and Science* (pp. 47–56). Banff.

Toussaint, G. T. (2013). *The Geometry of Musical Rhythm: What Makes a "Good" Rhythm Good?* CRC Press. (2nd ed. 2019)

Tymoczko, D. (2011). *A Geometry of Music: Harmony and Counterpoint in the Extended Common Practice*. Oxford University Press.

von Hippel, P., & Huron, D. (2000). Why do skips precede reversals? The effect of tessitura on melodic structure. *Music Perception*, 18(1), 59–85.

Vuza, D. T. (1991–1993). Supplementary sets and regular complementary unending canons (Parts 1–4). *Perspectives of New Music*, 29(2)–31(1).

Wilson, C. (2013). A tale of two clocks: Scheduling Web Audio with precision. *HTML5 Rocks* (now at web.dev).

Wolfram, S. (1983). Statistical mechanics of cellular automata. *Reviews of Modern Physics*, 55(3), 601–644. https://doi.org/10.1103/RevModPhys.55.601

## 13. Attribution and originality

**Third-party code.** No libraries are bundled. Two small public-domain snippets are adapted, and credited in the source:

| Where | What | Source and licence |
|---|---|---|
| [core/rng.js](src/core/rng.js) `hashString` | string hash, trimmed to 32 bits | cyrb53 © 2018 bryc, https://github.com/bryc/code (public domain; "attribution appreciated") |
| [core/rng.js](src/core/rng.js) `Rng.next` | PRNG | mulberry32 by Tommy Ettinger (2017), JS form from bryc's public-domain PRNG collection |

**Published methods implemented from their descriptions** (no code copied): Bjorklund's algorithm, Euclidean rhythms and the timeline names (Toussaint 2005), elementary CA rule decoding (Wolfram 1983), L-system rewriting (Lindenmayer 1968), Sturmian and Fibonacci words, the generational GA with tournament selection, Tenney's harmonic distance, Web Audio look-ahead scheduling (Wilson 2013), Krumhansl–Kessler key finding (Krumhansl & Kessler 1982), and standard music theory: diatonic chords, Roman numerals, cadences, secondary dominants and tritone substitution, drop-2 and rootless voicings, twelve-tone row forms, and the historical tunings and temperaments listed in §8.4. Microtonal output uses the MIDI 1.0 pitch-bend sensitivity RPN with one-note-per-channel allocation, as in MPE.

**The project's own design.** These are heuristics designed for this project, not taken from the literature:
- the descriptor parser and descriptor table
- the shared fitness function and its coefficients
- the span-subdividing L-system rules
- CA mutation-rate adoption
- crystal nucleation and growth
- the interference field
- applying Tenney height to rhythmic ratios
- the playability rules
- the velocity formula
- the part roles, motif mutation, fills, blasts, lulls and march rolls
- the irrational-meter grid mapping
- the style/description layering weights and the per-style meter and tempo suggestions
- the harmony vocabulary and style table, the progression templates and their selection, the voicing cost function, the bass and comping patterns tied to drum lanes, the melody fitness function and phrase forms, the ornament carving, and the voice classification used when importing MIDI

Genre and era settings (e.g. doom, djent, baroque, maqam) are informal and reflect common practice, not research. Maqam, raga and gamelan scales and tunings are simplified approximations.

**Trademarks.** Superior Drummer and SDX are trademarks of Toontrack Music AB. This project isn't affiliated with or endorsed by Toontrack. General MIDI is a specification of the MIDI Manufacturers Association (now the MIDI Association).
