// Static game content: courts, regions, winnow marks, side jobs, story spine.
// Everything here is data; rules live in state.js.

export const COURTS = ['night', 'spring', 'summer', 'autumn', 'winter', 'day', 'dawn'];

export const COURT_NAMES = {
  night: 'Night Court',
  spring: 'Spring Court',
  summer: 'Summer Court',
  autumn: 'Autumn Court',
  winter: 'Winter Court',
  day: 'Day Court',
  dawn: 'Dawn Court',
};

// Every region lives on the one island. `court` decides whose trust work there moves.
// `flight` sets how hard wings work: city air is short hops, steppe air is long and tiring.
export const REGIONS = {
  mortal_village: { name: 'Mortal village & cottage', court: null, flight: 'none', act: 1 },
  spring_manor: { name: 'Spring manor & rose grounds', court: 'spring', flight: 'none', act: 1 },
  under_mountain: { name: 'Prison under the mountain', court: null, flight: 'none', act: 1, storyOnly: true },
  velaris: { name: 'Velaris', court: 'night', flight: 'city', act: 2 },
  house_of_wind: { name: 'House of Wind', court: 'night', flight: 'city', act: 2 },
  hewn_city: { name: 'Hewn City', court: 'night', flight: 'none', act: 2 },
  windhaven: { name: 'Windhaven war camps & steppe', court: 'night', flight: 'steppe', act: 2 },
  adriata: { name: 'Adriata harbor', court: 'summer', flight: 'city', act: 3 },
  autumn_forest: { name: "Beron's forest court", court: 'autumn', flight: 'steppe', act: 3 },
  winter_glasshouse: { name: 'Winter glasshouse court', court: 'winter', flight: 'steppe', act: 3 },
  dawn_infirmary: { name: "Dawn's cliff infirmary", court: 'dawn', flight: 'city', act: 3 },
  day_library: { name: "Day's library", court: 'day', flight: 'city', act: 3 },
  the_middle: { name: 'The Middle', court: null, flight: 'none', act: 2, storyOnly: true },
};

// Hybern is deliberately absent: it is across the western sea and never a playground.

export const WINNOW_MARKS = {
  rainbow_steps: { region: 'velaris', name: 'Rainbow — painted steps' },
  palace_thread: { region: 'velaris', name: 'Palace of Thread and Jewels' },
  sidra_dock: { region: 'velaris', name: 'Sidra skiff dock' },
  stair_foot: { region: 'velaris', name: 'Foot of the ten thousand steps' },
  house_of_wind: { region: 'velaris', name: 'House of Wind terrace' },
  townhouse: { region: 'velaris', name: 'Townhouse door' },
  cottage_gate: { region: 'mortal_village', name: 'Cottage gate' },
  village_square: { region: 'mortal_village', name: 'Village well' },
  family_estate: { region: 'mortal_village', name: 'The estate by the sea road' },
  manor_roses: { region: 'spring_manor', name: 'Rose garden gate' },
  manor_steps: { region: 'spring_manor', name: 'Manor steps' },
  hewn_gate: { region: 'hewn_city', name: 'Hewn City gate' },
  keir_hall: { region: 'hewn_city', name: "Keir's hall" },
  windhaven_ring: { region: 'windhaven', name: 'Windhaven training ring' },
  emerie_shop: { region: 'windhaven', name: "Emerie's shop" },
  adriata_quay: { region: 'adriata', name: 'Adriata net quay' },
  autumn_gate: { region: 'autumn_forest', name: 'Forest Court gate' },
  glasshouse_door: { region: 'winter_glasshouse', name: 'Glasshouse doors' },
  dawn_terrace: { region: 'dawn_infirmary', name: 'Infirmary terrace' },
  day_stacks: { region: 'day_library', name: 'Day library, east stacks' },
};

// Side jobs. Completing them opens shops, camps and siblings — never a troop count by itself.
// `trustWork` names which court's land the work happened on (if any).
export const SIDE_JOBS = {
  sunk_pigment: {
    title: 'Pigment in the Sidra',
    region: 'velaris',
    giver: 'Rainbow painter',
    summary: 'A crate of ground lapis and cinnabar went off a skiff. Pole out and hook it up before the river takes the color.',
    unlocks: { shop: 'rainbow_pigment_seller' },
    social: { rainbow_pigment_seller: 2 },
  },
  thread_shakedown: {
    title: 'A cousin at the Palace',
    region: 'velaris',
    giver: 'Weaver at the Palace of Thread and Jewels',
    summary: 'A Hewn City cousin is leaning on the silk sellers. No street fight. Make him leave.',
    unlocks: { shop: 'palace_silk_merchant' },
    social: { palace_silk_merchant: 2 },
  },
  priestess_stairs: {
    title: 'Ten thousand steps, on foot',
    region: 'house_of_wind',
    giver: 'A priestess of the House',
    summary: 'She will not be carried or flown. Walk her up, at her pace.',
    unlocks: { sibling: 'priestess_circle' },
  },
  rainbow_singer: {
    title: 'One set below',
    region: 'hewn_city',
    giver: 'A Rainbow singer',
    summary: 'She has agreed to sing one set in the Hewn City. Get her in, and get her out.',
    unlocks: { shop: 'rainbow_music_hall' },
    heat: 5,
  },
  clipped_wings: {
    title: 'Count the clipped wings',
    region: 'windhaven',
    giver: 'Camp quartermaster',
    summary: 'Walk the camp and count the females whose wings were clipped. Decide what goes in the ledger.',
    unlocks: { camp: 'windhaven_south' },
  },
  sheep_pass: {
    title: 'Sheep out of the pass',
    region: 'windhaven',
    giver: 'A shepherd boy',
    summary: 'Early snow in the pass. Walk the flock down before dark.',
    unlocks: { camp: 'windhaven_pass' },
  },
  adriata_nets: {
    title: 'Nets after the storm',
    region: 'adriata',
    giver: 'Quay net-mender',
    summary: 'Mend what the storm tore. Knot by knot.',
    unlocks: { shop: 'adriata_quay_market' },
  },
  day_reshelve: {
    title: 'The east wing, by hand',
    region: 'day_library',
    giver: 'Under-librarian',
    summary: 'Magic scrambles the catalogue. Reshelve a wing of the library by hand.',
    unlocks: { sibling: 'day_scribes' },
  },
  copy_ward: {
    title: 'Copy a ward',
    region: 'velaris',
    giver: 'Ward-scribe',
    summary: 'Copy a protective ward line for line. A smudge breaks it.',
    unlocks: { shop: 'ward_scribe' },
  },
  cottage_roof: {
    title: 'The cottage roof',
    region: 'mortal_village',
    giver: 'The family who moved in',
    summary: 'Your old roof leaks over their children. Fix it.',
    unlocks: { sibling: 'village_family' },
  },
  solstice_gifts: {
    title: 'Five gifts, in order',
    region: 'velaris',
    giver: 'The townhouse',
    summary: 'Carry five Solstice gifts across the city and hand them over in the right order.',
    unlocks: { shop: 'solstice_market' },
    seasonal: 'solstice',
  },
  confession_hour: {
    title: 'Confession hour',
    region: 'hewn_city',
    giver: 'A guard under the mountain',
    summary: 'Sit through confession hour. Say nothing you cannot take back.',
    unlocks: {},
    heat: -5,
  },
};

export const STORY = [
  { act: 1, title: 'Spring', beats: ['The wolf in the snow', 'The Spring manor', 'Fire night', 'The three trials under the mountain'], structure: 'linear' },
  { act: 2, title: 'Night', beats: ['The bargain', 'The Weaver', 'The Suriel in the Middle', "Keir's throne room", 'The mortal queens'], structure: 'open city' },
  { act: 3, title: 'War', beats: ['Spy in Spring', 'The High Lords, one by one', 'The war table'], structure: 'open island' },
  { act: 'N', title: 'Nesta', beats: ['House of Wind', 'The training ring', "Emerie's shop", 'The Blood Rite'], structure: 'second campaign' },
];

// The ten thousand steps; the slice compresses them, and the stair job counts them honestly.
export const HOUSE_OF_WIND_STEPS = 10000;
