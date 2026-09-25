/**
 * Friendly, themed words for generated passphrases (research, seminars, Fridays, coffee, nature,
 * animals, snacks, cheerful adjectives). Lowercase ASCII, 3 to 10 letters, no duplicates.
 * 4 words + 2 digits from ~450 words is about 42 bits of entropy, which is plenty behind argon2id
 * and a login rate limit, and still easy to read out loud.
 */
const RAW = `
abstract appendix archive atlas axiom baseline batch beacon benchmark chapter citation circuit
cluster compass compiler crystal dataset delta draft enzyme epoch evidence figure finding footnote
fossil genome gradient graph hypothesis index insight journal kernel lambda lemma lens margin matrix
median method metric model neuron node notebook omega orbit outlier pattern photon pilot pixel
poster preprint prism proof protein prototype quark query result review revision sample script
sensor sigma signal sketch spectrum survey syntax table tensor theorem theory thesis theta trial
variable vector voxel alpha atom beta gamma kappa quanta sonar radar laser optics logic
slide podium speaker audience applause coffee cookie donut muffin bagel croissant biscuit snack
lunch whiteboard marker chalk pointer projector agenda rundown handout badge lanyard ticket seat
stool chair hallway lounge campus library studio garden seminar lecture forum panel keynote demo
friday weekend sunset afternoon breeze picnic playlist cheers highfive teatime kopi teh
maple cedar willow bamboo fern moss lotus orchid tulip daisy clover meadow river canyon glacier
island harbor lagoon reef coral pebble boulder summit valley forest prairie tundra aurora comet
nebula galaxy planet meteor moon cloud rain thunder rainbow ocean wave tide dune oasis volcano
geyser jungle orchard acorn pinecone sprout seedling blossom petal sunflower cactus ivy lichen
otter panda koala falcon owl heron robin sparrow finch penguin dolphin whale turtle gecko lemur
badger beaver fox lynx bison moose alpaca llama yak zebra giraffe hippo rhino tiger cheetah
jaguar orca puffin pelican toucan parrot kiwi wombat hedgehog squirrel rabbit hamster bee beetle
moth butterfly firefly snail octopus squid crab lobster walrus mantis cricket gibbon tapir
mango papaya banana lemon lime cherry peach plum apricot fig olive ginger cinnamon vanilla cocoa
caramel honey waffle pancake noodle dumpling tofu tempeh satay sambal pretzel popcorn toast
brownie cupcake sundae sorbet gelato matcha latte mocha espresso cappuccino
brave calm clever cozy curious eager gentle happy jolly kind lively lucky merry mighty nimble
polite proud quick quiet sunny swift witty bold bright breezy bubbly cheerful chill crisp daring
dreamy fuzzy glad grand humble keen lucid mellow neat noble peppy plucky rapid rosy snug spry
steady tidy vivid warm zesty zippy fresh fancy fluffy sparkly cosmic golden silver amber
circle triangle square arch sphere cube spiral ribbon hexagon cone pyramid ring
blue yellow red green teal indigo violet crimson scarlet cobalt saffron ochre mint lilac
anchor balloon banjo bicycle blanket bookmark bottle bucket button candle canoe castle compass
cookie crayon cushion domino drum easel feather flute gadget glove guitar hammock harmonica
helmet jigsaw kayak kettle kite ladder lantern locket magnet map mitten mug origami paddle
pencil piano pillow postcard puzzle quilt radio rocket sailboat scooter shovel skateboard
spoon stamp teapot telescope trumpet tuba ukulele umbrella violin wagon whistle yoyo zeppelin
atlas beacon bridge canvas cipher cosmos echo ember fable glimmer harmony horizon jubilee
lullaby meadow mosaic nectar nimbus opal paradox quest riddle saga sonnet tango tempo tundra
velvet vista whisper zenith
`;

export const WORDLIST: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      RAW.split(/\s+/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => /^[a-z]{3,10}$/.test(w)),
    ),
  ),
);
