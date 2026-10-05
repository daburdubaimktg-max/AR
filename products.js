// ORS Olive Oil catalogue + "Hair Match" logic, shared by logo.html and ritual.html.
//
// Product names and links are from orshaircare.com (Olive Oil Classics, Max
// Moisture and Edge Control pages). Descriptions are deliberately plain (what
// the product is, how to use it) — have brand/regulatory review the copy and
// swap links for your market's store before launch.

const SITE = "https://www.orshaircare.com";

export const PRODUCTS = {
  sfShampoo: {
    name: "Olive Oil Sulfate-Free Hydrating Shampoo",
    kind: "Shampoo", url: `${SITE}/products/ors-shampoo-olive-oil-sulfate-free-hydrating-12-5oz`,
    tags: ["curly", "coily", "wavy", "washngo", "dryness", "scalp", "frizz"],
  },
  mmShampoo: {
    name: "Olive Oil Max Moisture Sulfate-Free Shampoo",
    kind: "Shampoo", url: `${SITE}/products/max-moisture-super-hydrating-sulfate-free-shampoo-16-oz-1`,
    tags: ["curly", "coily", "washngo", "dryness"],
  },
  aloeShampoo: {
    name: "Olive Oil Deep Cleansing Creamy Aloe Shampoo",
    kind: "Shampoo", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-moisture-restore-creamy-aloe-shampoo`,
    tags: ["relaxed", "straight", "protective", "scalp", "breakage"],
  },
  replenishing: {
    name: "Olive Oil Strengthen & Restore Replenishing Conditioner",
    kind: "Conditioner", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-strengthen-nourish-replenishing-conditioner-1`,
    tags: ["relaxed", "straight", "breakage", "wavy", "edges"],
  },
  deepTreatment: {
    name: "Olive Oil Max Moisture Deep Treatment Conditioner",
    kind: "Deep conditioner", url: `${SITE}/products/ors-olive-oil-max-moisture-deep-conditioner-20-ounce`,
    tags: ["curly", "coily", "dryness", "breakage", "protective", "frizz"],
  },
  leaveIn: {
    name: "Olive Oil Max Moisture Leave-In Conditioner",
    kind: "Leave-in", url: `${SITE}/products/max-moisture-super-silkening-leave-in-conditioner-16oz-1`,
    tags: ["curly", "coily", "wavy", "washngo", "dryness", "frizz"],
  },
  lotion: {
    name: "Olive Oil Moisturizing Hair Lotion",
    kind: "Hair lotion", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-incredibly-rich-oil-moisturizing-hair-lotion`,
    tags: ["coily", "relaxed", "straight", "protective", "breakage", "dryness", "scalp"],
  },
  cremeDress: {
    name: "Olive Oil Fortifying Creme Hair Dress",
    kind: "Hair dress", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-fortifying-creme-hair-dress`,
    tags: ["protective", "scalp", "breakage", "coily"],
  },
  curlMousse: {
    name: "Olive Oil Max Moisture Curl Defining Mousse",
    kind: "Curl mousse", url: `${SITE}/products/ors-olive-oil-max-moisture-super-soft-style-curl-defining-mousse-infused-with-rice-water-electrolytes-for-supercharged-hydration-growth-7-0-oz`,
    tags: ["curly", "wavy", "washngo", "frizz"],
  },
  pudding: {
    name: "Olive Oil Smooth-N-Hold Pudding",
    kind: "Styling pudding", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-style-and-curl-smooth-n-hold-pudding-13-ounce`,
    tags: ["coily", "curly", "protective", "washngo", "frizz"],
  },
  wrapMousse: {
    name: "Olive Oil Wrap Set Mousse",
    kind: "Setting mousse", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-hold-shine-wrap-set-mousse`,
    tags: ["relaxed", "straight"],
  },
  polisher: {
    name: "Olive Oil Glossing Hair Polisher",
    kind: "Hair polisher", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-anti-frizz-glossing-hair-polisher-6-oz`,
    tags: ["straight", "relaxed", "frizz"],
  },
  sheen: {
    name: "Olive Oil Nourishing Sheen Spray",
    kind: "Sheen spray", url: `${SITE}/collections/olive-oil-classics/products/ors-olive-oil-nourishing-sheen-spray-11-7-oz`,
    tags: ["protective", "relaxed", "frizz", "straight"],
  },
  edgeGel: {
    name: "Olive Oil Edge Control Hair Gel",
    kind: "Edge control", url: `${SITE}/products/edge-control-hair-gel`,
    tags: ["edges", "protective", "relaxed", "straight"],
  },
  mmEdgeGel: {
    name: "Olive Oil Max Moisture Strong Hold Edge Gel",
    kind: "Edge gel", url: `${SITE}/products/olive-oil-ors-olive-oil-max-moisture-nourish-shine-strong-hold-edge-gel-with-rice-water-electrolytes-4-0-oz`,
    tags: ["edges", "curly", "coily", "washngo"],
  },
};

export const SHOP_ALL = `${SITE}/collections/olive-oil-classics`;

export const QUESTIONS = [
  {
    id: "type",
    olive: "Hi! I'm Ollie 🫒 Let's find your ritual. What's your hair type?",
    options: [
      { id: "wavy", label: "Wavy", emoji: "〰️" },
      { id: "curly", label: "Curly", emoji: "➰" },
      { id: "coily", label: "Coily / kinky", emoji: "🌀" },
      { id: "relaxed", label: "Relaxed", emoji: "💇🏾‍♀️" },
    ],
  },
  {
    id: "concern",
    olive: "Love it! What does your hair need most right now?",
    options: [
      { id: "dryness", label: "More moisture", emoji: "💧" },
      { id: "breakage", label: "Less breakage", emoji: "💪🏾" },
      { id: "edges", label: "Edge care", emoji: "✨" },
      { id: "frizz", label: "Less frizz, more shine", emoji: "🌟" },
      { id: "scalp", label: "Dry scalp", emoji: "🫶🏾" },
    ],
  },
  {
    id: "style",
    olive: "Last one: how do you wear it most days?",
    options: [
      { id: "washngo", label: "Wash & go / natural", emoji: "🌿" },
      { id: "protective", label: "Braids, twists, locs or wigs", emoji: "🧶" },
      { id: "straight", label: "Silk press / straightened", emoji: "🪮" },
      { id: "relaxed", label: "Relaxed & styled", emoji: "💁🏾‍♀️" },
    ],
  },
];

const STEPS = [
  { id: "cleanse", title: "Cleanse", pick: ["sfShampoo", "mmShampoo", "aloeShampoo"], how: "Wash gently, focusing on your scalp." },
  { id: "condition", title: "Condition", pick: ["deepTreatment", "replenishing"], how: "Work through mid-lengths and ends; rinse well." },
  { id: "moisturise", title: "Moisturise", pick: ["leaveIn", "lotion", "cremeDress"], how: "Apply section by section on damp hair." },
  { id: "style", title: "Style", pick: ["curlMousse", "pudding", "wrapMousse", "polisher", "sheen"], how: "Style and finish the way you love." },
  { id: "edges", title: "Edges", pick: ["edgeGel", "mmEdgeGel"], how: "Lay your edges with a soft brush." },
];

const FOCUS = {
  dryness: "Your focus is moisture: apply your leave-in on damp hair and seal it in, section by section.",
  breakage: "Your focus is gentle handling: detangle from ends to roots and keep moisture up between washes.",
  edges: "Your focus is your edges: go light on product, use a soft brush and avoid pulling styles.",
  frizz: "Your focus is smooth shine: style on damp hair and finish with a light layer.",
  scalp: "Your focus is your scalp: massage gently at the roots and keep it clean between styles. If irritation persists, see a dermatologist.",
};

// answers: { type, concern, style } -> { steps: [{title, how, product}], focus }
export function matchRoutine(answers) {
  const want = [answers.type, answers.concern, answers.style];
  const score = (key) => {
    const t = PRODUCTS[key].tags;
    return (t.includes(answers.concern) ? 3 : 0) + (t.includes(answers.type) ? 2 : 0) + (t.includes(answers.style) ? 1 : 0);
  };
  const needsEdges = answers.concern === "edges" || answers.style === "protective" || answers.style === "straight";
  const steps = STEPS
    .filter((s) => s.id !== "edges" || needsEdges)
    .map((s) => {
      const key = [...s.pick].sort((a, b) => score(b) - score(a))[0];
      return { id: s.id, title: s.title, how: s.how, key, product: PRODUCTS[key] };
    });
  return { steps, focus: FOCUS[answers.concern], answers: want };
}
