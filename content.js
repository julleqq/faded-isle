// All of the game's words live here, so iterating on the writing never
// requires touching game logic. Edit freely.
//
// A note on the Rumi lines: they are loose renderings in my own words of
// passages from Rumi's Masnavi, not direct translations. Many popular
// "Rumi quotes" online are misattributed or come from copyrighted modern
// versions, so these stay close to images that are genuinely his.
// Swap in your favourite translation any time.

export const TITLE = 'The Faded Isle';
export const SUBTITLE = 'a quiet journey through the six pillars of acceptance & commitment therapy';

export const CHARACTERS = [
  { id: 'monk',  name: 'Wandering Monk', blurb: 'Robed, slow, and patient as a stone.' },
  { id: 'fox',   name: 'Little Fox',     blurb: 'Curious nose, soft paws, bright tail.' },
  { id: 'drop',  name: 'Ink Drop',       blurb: 'A single drop of ink. Anyone at all.' },
  { id: 'crane', name: 'Paper Crane',    blurb: 'Folded from an old letter, light as breath.' },
];

export const INTRO = [
  'You wake to the sound of the sea.',
  'The island around you is drawn in grey ink, as if someone painted it and forgot the colours.',
  'Where your feet touch the ground, colour returns.',
  'Six spirits live on this island. Each keeps one way of living well with a restless mind.',
  'Six paths lead out from the Great Tree. Walk any of them. There is no wrong order.',
];

// The six pillars of ACT. `plain` is shown when you learn the pillar;
// `more` is optional deeper teaching behind a "Learn more" button.
export const PILLARS = {
  present: {
    name: 'Present Moment',
    region: 'The Breathing Grove',
    guardian: 'Hush, the Deer',
    color: '#6f9e5a',
    move: 'drop_anchor',
    greet: [
      'A deer stands between the bamboo, perfectly still.',
      'Hush: "Your mind has walked here from yesterday and tomorrow. Your feet walked here from just now."',
      'Hush: "Breathe with me for a moment."',
    ],
    plain: 'Contact with the present moment means gently bringing your attention to what is here, now: your breath, sounds, the ground under you. The mind loves to time-travel into worries and replays. Now is the only place where you can actually act.',
    more: [
      'This is not about relaxing or emptying the mind. It is about flexible attention: being able to notice where your attention is and choose where to place it.',
      '"Dropping anchor" is a quick practice: notice what is showing up inside you, come back into your body (press your feet into the floor, straighten your back), then engage with what is around you. Name five things you can see.',
      'Try it anywhere: while washing dishes, feel the water temperature, the weight of a plate, the sound. When the mind wanders, and it will, notice where it went and come back. The coming back is the practice.',
    ],
    rumi: 'Every moment the world is made new,\nand we, seeing it unchanged, do not notice.',
    rumiSource: 'after Rumi, Masnavi I',
  },
  defusion: {
    name: 'Defusion',
    region: 'The Stream of Leaves',
    guardian: 'Ripple, the Koi',
    color: '#d9823b',
    move: 'name_thought',
    greet: [
      'A great koi circles in the stream. Maple leaves drift over its back.',
      'Ripple: "You carry so many words. Some are heavy. Some are not even yours."',
      'Ripple: "Let us put them on leaves and watch them float."',
    ],
    plain: 'Cognitive defusion means seeing thoughts as thoughts: words and pictures passing through the mind, not commands or facts. When we are fused with a thought, it feels like the truth. When we defuse, we can hold it lightly and choose what to do.',
    more: [
      'You cannot stop thoughts from arriving, and arguing with them often makes them louder. Defusion changes your relationship to them instead.',
      'Try adding "I\'m having the thought that..." in front of a painful thought. "I\'m a failure" becomes "I\'m having the thought that I\'m a failure." Notice the small space that appears.',
      'Other ways: sing the thought to the tune of "Happy Birthday", say it in a cartoon voice, or thank your mind: "Thanks, mind, for trying to protect me." The point is not to make the thought vanish. It is to unhook from it.',
    ],
    rumi: 'A bird flies high; its shadow races on the ground.\nThe fool chases the shadow until his arrows are spent.',
    rumiSource: 'after Rumi, Masnavi I',
  },
  acceptance: {
    name: 'Acceptance',
    region: 'The Tidal Shore',
    guardian: 'Old Shell, the Turtle',
    color: '#3f8fa0',
    move: 'make_room',
    greet: [
      'An ancient turtle rests where the waves arrive.',
      'Old Shell: "I have been here a thousand tides. I stopped fighting the water a long time ago."',
      'Old Shell: "Watch the waves with me. Your arms will want to push. See what happens if you open them instead."',
    ],
    plain: 'Acceptance means making room for difficult feelings, sensations and urges instead of fighting or avoiding them. Not liking them, not giving up, but letting them be here while you go on living. Struggling with pain tends to add suffering on top of it.',
    more: [
      'Pain is part of a meaningful life. We lose people we love, fail at things we care about, feel fear before things that matter. Trying to never feel these things often shrinks our lives.',
      'Practice "expansion": notice where the feeling lives in your body. Breathe into it. Imagine making space around it, as if the feeling could float in a larger room. You are not trying to get rid of it, only to stop tugging.',
      'A useful question: "Am I willing to have this feeling, if it means I can do what matters to me?"',
    ],
    rumi: 'The body is a guest-house; each morning a new guest arrives.\nDo not call any of them a burden. Each was sent from beyond.',
    rumiSource: 'after Rumi, Masnavi V',
  },
  selfctx: {
    name: 'Self-as-Context',
    region: 'The Mirror Lake',
    guardian: 'Stillwater, the Heron',
    color: '#7a6fb0',
    move: 'become_sky',
    greet: [
      'A heron stands on one leg at the lake\'s edge. The water is so still it holds the whole sky.',
      'Stillwater: "Clouds cross the lake. Storms cross the lake. The lake remains."',
      'Stillwater: "Tell me, who is it that notices the weather?"',
    ],
    plain: 'Self-as-context is the part of you that notices: the steady observer that has been present for every thought, feeling and memory you have ever had. Thoughts and feelings change like weather. The one who notices them is like the sky: it holds every storm and is never harmed by one.',
    more: [
      'We often live inside stories about ourselves: "I\'m the anxious one", "I\'m not a creative person." These stories can be useful, but they are not the whole of you.',
      'Try this: notice that you are reading. Now notice who is noticing. That noticing-self was there when you were a child, and it is here now. Your body, roles and moods have changed; the one who observes has not.',
      'From this place, even very painful experiences can be held without being swallowed by them.',
    ],
    rumi: 'The heart is a mirror.\nPolish it, and it shows the whole sky without becoming the sky.',
    rumiSource: 'after Rumi, Masnavi I',
  },
  values: {
    name: 'Values',
    region: 'The Lantern Summit',
    guardian: 'Lumen, the Owl',
    color: '#d6a634',
    move: 'remember',
    greet: [
      'At the top of the mountain, an owl sits among unlit paper lanterns.',
      'Lumen: "Every lantern here is something a heart can care about. None are the right ones. Some are yours."',
      'Lumen: "Choose the ones that feel like home. We will light them together."',
    ],
    plain: 'Values are the qualities you want to bring to your life: how you want to treat yourself, others and the world. Unlike goals, values are never "finished". They are a compass direction, not a destination. They give meaning to the hard things we are willing to feel.',
    more: [
      'Goals can be ticked off ("run a marathon"). Values are ongoing ("caring for my body", "being adventurous").',
      'Clues to your values often hide inside your pain: we hurt about what we care about. Loneliness can point to a value of connection; anxiety before a performance, to a value of doing good work.',
      'Ask yourself: "At my 80th birthday, what would I want people to say I stood for?" Or: "If no one would ever know, what would I still want to do?"',
    ],
    rumi: 'Listen to the reed flute and its sad song.\nIt longs for the reed-bed it was cut from; its longing is its music.',
    rumiSource: 'after Rumi, Masnavi I',
  },
  action: {
    name: 'Committed Action',
    region: 'The Stepping Stones',
    guardian: 'Leap, the Frog',
    color: '#c0504d',
    move: 'step_with',
    greet: [
      'A small frog sits on a stone in the middle of the pond.',
      'Leap: "Hello! Everyone wants to cross in one jump. Nobody can."',
      'Leap: "One stone at a time. And yes, your worries can come along."',
    ],
    plain: 'Committed action means taking steps, often small ones, in the direction of your values, even when difficult thoughts and feelings come along. It is where all the other pillars meet: noticing, unhooking, making room, and then moving toward what matters.',
    more: [
      'Start small: the smallest step you could take today toward a value. Then the next one. Small, repeated actions build a life.',
      'Obstacles will show up: fear, "I can\'t", "not now". Expect them. You do not need to wait for them to leave before you move.',
      'When you slip, and everyone does, notice without harsh judgment and return to your values. Commitment is not never falling off; it is getting back on.',
    ],
    rumi: 'The road has no end. Still, lift your foot and walk.\nDo not stare fearfully at the distance.',
    rumiSource: 'after Rumi (traditional attribution)',
  },
};

export const PILLAR_ORDER = ['present', 'defusion', 'acceptance', 'selfctx', 'values', 'action'];

// Encounter moves. `pillar: null` = always known.
// `effect` changes the struggle meter (negative = the struggle eases).
export const MOVES = {
  notice:       { name: 'Notice it', pillar: null, effect: -15,
                  text: 'You simply notice it. "Ah. Here you are."' },
  drop_anchor:  { name: 'Drop anchor', pillar: 'present', effect: -25,
                  text: 'You press your feet into the earth, breathe, and look around. The ground is here. So are you.' },
  name_thought: { name: 'Name the thought', pillar: 'defusion', effect: -25,
                  text: '"I\'m having the thought that..." The words lose some of their grip.' },
  make_room:    { name: 'Make room', pillar: 'acceptance', effect: -25,
                  text: 'You breathe into the feeling and let it have some space, like opening a window.' },
  become_sky:   { name: 'Become the sky', pillar: 'selfctx', effect: -25,
                  text: 'You notice that you are the one noticing. The weather passes through; the sky remains.' },
  remember:     { name: 'Remember what matters', pillar: 'values', effect: -25,
                  text: 'You remember what you care about. The creature is still here, but it is no longer steering.' },
  step_with:    { name: 'Step with it', pillar: 'action', effect: -25,
                  text: 'You take one small step toward what matters, and let it come along.' },
};

// Tempting "unworkable" moves. They feel natural and make the struggle grow.
export const STRUGGLE_MOVES = [
  { name: 'Push it away', text: 'You push with all your strength. It pushes back, harder.' },
  { name: 'Argue with it', text: 'You argue. It has an answer for everything, and now it has your full attention.' },
  { name: 'Distract yourself', text: 'You look away. For a moment it is gone... then it is louder than before.' },
  { name: 'Run from it', text: 'You run. It is faster, because it lives inside your own footsteps.' },
];

// Wild spirits in the tall grass. `weak` pillars ease the struggle faster.
export const CREATURES = [
  { id: 'worry',   name: 'Worrywisp',     color: '#8fa7c9', weak: ['present', 'acceptance'],
    thought: '"What if everything goes wrong?"',
    lore: 'Worrywisp lives in tomorrow. It means well: it is trying to prepare you for every danger at once.' },
  { id: 'doubt',   name: 'Doubt Thorn',   color: '#9c7bb8', weak: ['defusion', 'selfctx'],
    thought: '"You\'re not good enough."',
    lore: 'Doubt Thorn repeats old words it once overheard. It believes them less than you might think.' },
  { id: 'regret',  name: 'Regret Echo',   color: '#b89a7b', weak: ['present', 'selfctx'],
    thought: '"You should have done it differently."',
    lore: 'Regret Echo lives in yesterday. Its sorrow shows how much you cared.' },
  { id: 'sorrow',  name: 'Sorrow Drizzle',color: '#6f95b5', weak: ['acceptance', 'values'],
    thought: 'A soft, heavy rain that won\'t stop.',
    lore: 'Sorrow Drizzle waters the places where love used to grow, and still grows.' },
  { id: 'ember',   name: 'Ember',         color: '#d8674a', weak: ['acceptance', 'present'],
    thought: '"It\'s not fair!"',
    lore: 'Ember flares when something important is crossed. It is a signal, not a command.' },
  { id: 'shame',   name: 'Shame Shell',   color: '#c98fa0', weak: ['selfctx', 'acceptance'],
    thought: '"Hide. Don\'t let them see."',
    lore: 'Shame Shell curls up to protect a soft heart. It relaxes a little whenever it is met with kindness.' },
  { id: 'restless',name: 'Restless Gale', color: '#8fbf9f', weak: ['present', 'defusion'],
    thought: '"Do something else. Anything else. Now."',
    lore: 'Restless Gale is the urge to escape. It passes, like all wind, if you let it blow.' },
  { id: 'cant',    name: 'Can\'t Stone',  color: '#9a9a8a', weak: ['values', 'action'],
    thought: '"I can\'t do it."',
    lore: 'Can\'t Stone is heavy, but it can be carried. People carry it all the way to their dreams.' },
];

// Scattered verse stones. Read them in the world; they collect in the Journal.
export const VERSES = [
  { text: 'I died as a stone and became a flower,\ndied as a flower and rose as a creature.\nWhen was I ever less by changing?', source: 'after Rumi, Masnavi III' },
  { text: 'The lamps are many; the light is one.', source: 'after Rumi, Masnavi III' },
  { text: 'Love is the astrolabe\nthat reads the mysteries of the heavens.', source: 'after Rumi, Masnavi I' },
  { text: 'The moth circles the candle\nbecause it has seen the light.', source: 'after Rumi' },
];

export const VALUE_LANTERNS = [
  'Kindness', 'Curiosity', 'Courage', 'Connection', 'Creativity', 'Health',
  'Honesty', 'Play', 'Growth', 'Nature', 'Calm', 'Adventure',
  'Family', 'Learning', 'Fairness', 'Beauty', 'Self-care', 'Contribution',
];

// Small committed steps offered at the stepping stones, per value.
export const SMALL_STEPS = {
  default: ['Send one kind message', 'Take a ten-minute walk', 'Write one sentence', 'Ask one honest question', 'Rest without guilt for five minutes'],
  Kindness: ['Say something kind to someone today', 'Speak to yourself like a friend once today'],
  Curiosity: ['Look up one thing you\'ve wondered about', 'Ask someone about their day and really listen'],
  Courage: ['Do one small thing you\'ve been avoiding', 'Say "no" once where you mean no'],
  Connection: ['Message a friend you miss', 'Put your phone away during one meal with someone'],
  Creativity: ['Draw, write or hum for five minutes', 'Make something imperfect on purpose'],
  Health: ['Drink a glass of water now', 'Go to bed 20 minutes earlier tonight'],
  Honesty: ['Tell someone how you really are', 'Write down one truth you\'ve been avoiding'],
  Play: ['Do something just for fun, for ten minutes'],
  Growth: ['Read five pages of something that stretches you'],
  Nature: ['Step outside and notice the sky for a minute'],
  Calm: ['Take three slow breaths before your next task'],
  Adventure: ['Walk a street you have never walked'],
  Family: ['Call or message a family member'],
  Learning: ['Learn one new word or fact today'],
  Fairness: ['Notice who isn\'t being heard, and listen'],
  Beauty: ['Take a photo of something beautiful today'],
  'Self-care': ['Do one thing today purely to look after yourself'],
  Contribution: ['Help someone with one small task'],
};

export const TREE = {
  asleep: [
    'The Great Tree sleeps. Its leaves are the grey of old ink.',
    'Six spirits hold its colours. Visit them, in any order.',
  ],
  ending: [
    'You rest your hand on the Great Tree.',
    'Six lights rise from the corners of the island: the grove, the stream, the shore, the lake, the summit, the stones.',
    'They meet in the branches. The tree remembers its colours.',
    'Nothing on the island has been fixed or removed. The worries still wander the grass. The waves still come.',
    'But now you know how to walk with them.',
  ],
  ending_rumi: 'Why stay in the prison\nwhen the door is wide open?',
  ending_rumi_source: 'after Rumi',
  outro: 'Open. Aware. Engaged. This is psychological flexibility: the heart of ACT.',
};

export const SIGN = [
  'A weathered sign stands by the Great Tree:',
  '"North: the Lantern Summit. North-west: the Breathing Grove. North-east: the Stream of Leaves. West: the Mirror Lake. East: the Stepping Stones. South: the Tidal Shore."',
  'Someone has scratched underneath: "Grey grass hides wandering spirits. Be kind to them."',
];

// Feedback goes to the game's GitHub repo as an issue (a public form; needs a free GitHub account).
export const FEEDBACK_URL = 'https://github.com/julleqq/faded-isle/issues/new?template=feedback.yml';

export const DISCLAIMER = 'A reflective game, not a substitute for therapy.';
