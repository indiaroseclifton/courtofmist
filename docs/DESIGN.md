# Court of Mist: design document

A third-person, open-world game about court life in Prythian. War comes second.
This is a non-commercial fan project. Prythian, its courts and its people belong to Sarah J. Maas.
Nothing here quotes the books. All dialogue is original.

---

## 1. Pillars

1. **Court life first, war second.** Most hours go to walking, talking, carrying, mending and choosing. Fights are rare and short.
2. **Trust comes from work.** No side job hands out troops. A court's army turns up at the war table only if you did the work on that court's own land.
3. **Debts are real.** Every bargain is a slip of paper you carry. It stays open until it's paid.
4. **The camera is a lens.** You're always looking through a 35 mm camera behind Feyre. Nothing in the UI floats over the world unless it's paper, ink or speech.

## 2. Look and render target (production)

| Element | Target in UE5 | How this repo's WebGL slice approximates it |
|---|---|---|
| Global illumination | Lumen, hardware RT on, final gather for interiors | Hemisphere ambient, emissive window atlas, and a pool of 12 real point lights that follow the camera from lantern to lantern |
| Geometry | Nanite masonry, every sett and cornice modelled | Facade atlas at true 3 m × 3.6 m bay scale, instanced stair treads, merged terraces |
| Skin | Substrate SSS profile, scanned heads, MetaHuman-grade rigs | Physical material with a warm sheen lobe standing in for scatter. Not comparable. |
| Hair | Groom strands with physics | 1,400 verlet strands per head, Kajiya-Kay shaded per vertex, colliding with skull and shoulders |
| Cloth | Chaos cloth on shirt hems, skirts, awnings | Linen and silk weave normals; awnings ripple in the wind; shirt tail lags the hips |
| Wet stone | Puddle masks, clearcoat, ripples | Procedural setts with low-roughness joints, clearcoat rain film, planar-reflection river |
| Camera | 35 mm, f/2–2.8, ACES, grain, motion blur on cuts only | 40° vFOV, Bokeh DOF with focus on the subject, ACES Filmic, luminance-weighted grain, a 12-tap smear on cuts only |

Things we avoid: cartoon shading, plastic skin, blank HDR bloom (the bloom threshold is set high), loot colors, minimaps, quest arrows.

**Light by region**

- **Velaris at night:** moonlight, its reflection on the Sidra, warm window glow, and mist that matches the horizon sky.
- **Hewn City:** torchlight on wet basalt and masked crowds. No moon.
- **Spring Court:** overcast daylight and mud on the roses. Soft and flat, never sunny.
- **Under the mountain:** a single source per room.

## 3. The island

Every region is on one island. **Hybern lies across the western sea and is never playable.** The painted map says so in ink.

| Region | Court | Flight | Act | Notes |
|---|---|---|---|---|
| Mortal village & cottage | none | none | 1 | South of the Wall, which shows only as a faint shimmer |
| Spring manor & rose grounds | Spring | none | 1 | Overcast daylight, mud on the roses |
| Prison under the mountain | none | none | 1 | Used only for the three trials and for confession hour |
| Velaris | Night | city | 2 | Four market palaces, the Rainbow, bridges, the Sidra |
| House of Wind | Night | city | 2 | Ten thousand steps. Walking them is a mission. |
| Hewn City | Night | none | 2 | Carved under the same mountain. Torches, masks, Keir |
| Windhaven | Night | steppe | 2 | War camps and long, tiring flights |
| Adriata | Summer | city | 3 | The harbor, nets and storms |
| Beron's forest court | Autumn | steppe | 3 | |
| Winter glasshouse | Winter | steppe | 3 | |
| Dawn's cliff infirmary | Dawn | city | 3 | |
| Day's library | Day | city | 3 | Reshelving by hand |

## 4. Story spine

- **Act 1: Spring (linear).** The wolf in the snow, the Spring manor, fire night, then the three trials under the mountain.
- **Act 2: Night (open city).** The bargain with the Night Court, then the Weaver, the Suriel in the Middle, Keir's throne room and the mortal queens. Velaris, the Hewn City and Illyria open.
- **Act 3: War (open island).** Feyre returns to Spring as a spy, then visits every High Lord. It ends at the war table, where unearned trust means missing armies.
- **Nesta campaign.** The House of Wind, the training ring, Emerie's shop and the Blood Rite.
- **Solstice** comes back every in-game year as a city event, with the gift-run job, a Solstice market and lit windows.

Between story missions the city stays open.

## 5. Systems

### Movement
- **On foot:** inertia, turn rate that drops with speed, a forward lean when accelerating, banking into turns, a hip drop on each footfall and higher knee lift on stairs.
- **Wings:** short city hops cost a little stamina (`0.035/s`). Steppe flight is long and tiring (`0.09/s`). You can't fly in Hewn City, under the mountain, Spring or the mortal lands. Stamina is never shown as a bar. It shows in the wingbeat, the breathing and in refusals ("Your wings are spent").
- **Winnowing:** only to marks you have already stood on. You learn a mark by walking to it, and you use it by clicking its pin on the painted map.

### Bargains
`GameState.strikeBargain / settleBargain`. Each bargain is a handwritten slip naming who owes whom and the terms. Open slips stay in your hand (B) until they're paid, and paid ones are crossed out in ink.

### Two social tracks
- **Hewn City heat (0–100).** Keir's attention. Refusing a summons, embarrassing a cousin and singing in his court all raise it. Confession hour lowers it. The ledger describes it in words ("Keir's people follow you at night"), never as a number.
- **Velaris social.** Each shopkeeper sits between −5 and 5, shown as cold, civil or warm.

### War table
Seven courts. `recordWork(court, region)` only counts work done in a region that belongs to that court. A court marches at **3** marks. Favors done in Velaris never move Summer's trust. Kindness in the wrong place is still kindness, but it isn't an army.

### Combat
Combat uses melee, the bow on her back and **one** earned power, unlocked by story. Fights are a few short scenes per act. No loot colors, no gear score.

### No
No romance meter. No cars. No loot rarity. No minimap. No purple arrows.

## 6. Side jobs

None of these are battles. Completing one opens a shop, a camp or a sibling questline. **None adds troops by itself.** Trust moves only because the work was done on that court's land.

| Job | Region | What you actually do | Opens |
|---|---|---|---|
| Pigment in the Sidra | Velaris | Take the skiff out and hook three sunk jars of pigment before the river carries the color off | Rainbow pigment seller |
| A cousin at the Palace | Velaris | Make a Hewn City cousin stop shaking down the Palace of Thread and Jewels **without a street fight**. You can pay him (a bargain) or use what the merchants told you. | Palace silk merchant |
| Ten thousand steps, on foot | House of Wind | Walk a priestess up the stair at her pace. She won't be carried or flown. Go too far ahead and she stops. | Priestess circle |
| One set below | Hewn City | Get a Rainbow singer through one set in Keir's court and out again | Rainbow music hall |
| Count the clipped wings | Windhaven | Walk the camp, count, and decide what goes in the ledger | Windhaven south camp |
| Sheep out of the pass | Windhaven | Walk a flock down through early snow before dark | Windhaven pass camp |
| Nets after the storm | Adriata | Mend torn nets knot by knot | Adriata quay market |
| The east wing, by hand | Day library | Reshelve a scrambled wing without magic | Day scribes |
| Copy a ward | Velaris | Copy a ward line by line. A smudge breaks it. | Ward-scribe |
| The cottage roof | Mortal village | Fix your old roof for the family who live there now | Village family |
| Five gifts, in order | Velaris (Solstice) | Carry five gifts across the city and hand them over in the right order | Solstice market |
| Confession hour | Under the mountain | Sit through it. Say nothing you can't take back. | Lowers heat |

## 7. Interface (all diegetic)

- **Speech:** subtitles under the picture with the speaker's name in small caps. Replies are numbered lines in italic. No boxes, portraits or wheels.
- **Prompts:** one italic line at the bottom of the screen, such as "E — speak with the painter". Nothing floats over anyone's head.
- **Bargain slips (B):** torn paper in the other party's handwriting.
- **The painted map (M):** a watercolor of Prythian on a wooden table. Carved counters show trust, and a red banner appears only when a court marches. A Velaris inset carries wax pins at the winnow marks you have learned. A paper ledger next to it holds armies, Keir's attention and the market's opinion of you.
- **No minimap, no compass bar, no quest arrows.** People tell you where things are.

## 8. What is built in this repository

Playable in a browser (three.js), all twelve places on one island, travelled between by road or winnowed to from the painted map:

| Region | What is there | Story beats | Open-world work |
|---|---|---|---|
| Mortal village (winter) | thatched cottages, the well, the family cottage, the estate on the sea road, snow-pine forest, the Wall shimmering to the north | the wolf in the snow, the beast at the door, the mortal queens | the cottage roof |
| Spring manor (overcast) | pale manor and portico, muddy gravel walks, rose beds, fountain, stables, Calanmai glade, the woods | the manor, naga in the woods, fire night, the bargain comes due, spy in Spring | a favor for Alis |
| Under the Mountain | cells, Amarantha's hall, the mud labyrinth, the spiked-ceiling riddle chamber | the three trials, the bargain in the dark, being Made | (none, by design) |
| Velaris + House of Wind | the Sidra, quays with CC0 street lanterns, bridges, the Rainbow, the Palace, the stair, the House and its training ring, the townhouse war table | the city of starlight, the war table, Nesta's first two beats | pigment, the cousin, the priestess, copy a ward, the singer, Solstice gifts |
| Hewn City | basalt cavern, carved facades, masked crowd, Keir's throne room, the singer's stage, the cells | Keir's throne room (refusable) | confession hour, the singer's set |
| The Middle | old dark wood, the Weaver's cottage, the Suriel's stone circle | the Weaver (stealth), the Suriel | — |
| Windhaven | steppe grass, hide tents, cook fires, the ring, Emerie's shop, the sheep pass and pen, Ramiel | Emerie's shop, the Blood Rite | count the clipped wings, sheep out of the pass |
| Adriata (golden hour) | sea, white town, piers and boats, the island palace, net frames | audience with Tarquin | nets after the storm, a favor |
| Forest Court (autumn) | copper forest, Beron's keep and towers | audience with Beron | two favors |
| Winter glasshouse | glass nave and dome on a snowfield, winter roses inside | audience with Kallias | two favors |
| Dawn infirmary (sunrise) | arcaded clifftop infirmary over the sea, fever beds | audience with Thesan | a favor |
| Day library (noon) | marble hall of stacks under skylights and sunbeams | audience with Helion | reshelve the east wing, a favor |

Systems: bargains as slips, Hewn City heat and Velaris social standing, war-table trust that only moves for work on a court's own land (3 marks to march), winnowing to visited marks, wings unlocked by story, combat (dagger, bow with draw, the earned light burst), a journal in her hand (J), Solstice as a recurring city event, and a second campaign as Nesta.

Graphics: 2048² tileable PBR texture sets (`tools/gen_textures.py`), CC0 Poly Haven HDR image-based lighting per region, a parametric sky (night, overcast, snow day, afternoon, golden hour, sunrise, noon), instanced forests, rose beds and wind-blown grass, reflective water, volumetric-looking mist and sunbeams, 4K shadow maps on high quality.

Not built: authored character art (drop a rigged GLB at `public/models/feyre.glb` to replace the procedural Feyre), voice, the war itself, Hybern (never playable).
