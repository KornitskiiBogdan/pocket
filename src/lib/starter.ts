import type { ReadingText } from '../types'

interface Seed {
  id: string
  title: string
  focus: string[]
  paragraphs: string[]
}

const SEEDS: Seed[] = [
  {
    id: 'starter-procrastination',
    title: 'Why we put things off',
    focus: ['put off', 'deadline', 'get round to', 'overwhelmed', 'break down', 'reward'],
    paragraphs: [
      'Most of us know the feeling. There is an important task on the list, the deadline is getting closer, and yet we suddenly find time to clean the kitchen or answer old messages. We put off the thing that matters and do everything else instead.',
      'Psychologists say procrastination is not really about laziness. It is about emotions. When a task makes us feel bored, anxious or overwhelmed, our brain looks for a quick way to feel better. Scrolling through a phone gives that relief in seconds.',
      'The good news is that small changes help. One trick is to break down a big job into tiny steps, so the first step feels almost too easy to avoid. Another is to work for just ten minutes and then decide whether to continue. Often, once we start, we keep going.',
      'It also helps to give yourself a small reward when you finish. You may never get round to everything on your list, but you will get round to the things that really count.',
    ],
  },
  {
    id: 'starter-four-day-week',
    title: 'The four-day working week',
    focus: ['trial', 'productivity', 'burnout', 'work-life balance', 'turn out', 'cut down on'],
    paragraphs: [
      'Imagine working four days a week for the same salary. For thousands of employees in Europe, this is no longer a dream. Several countries have run large trials in which companies cut working hours by a fifth without cutting pay.',
      'The results surprised many managers. In most companies, productivity stayed the same or even went up. People took fewer sick days, and fewer of them reported burnout. Many said they finally had a better work-life balance, with an extra day for family, sport or simply resting.',
      'So how is it possible to do the same work in less time? Teams learned to cut down on long meetings and constant emails. They planned their week more carefully and protected time for focused work.',
      'Not every job can change so easily. Hospitals, shops and schools need people every day. But for many office workers, the four-day week has turned out to be more practical than anyone expected.',
    ],
  },
  {
    id: 'starter-screen-time',
    title: 'Living with less screen time',
    focus: ['addictive', 'notification', 'cut back', 'urge', 'come across', 'pay attention'],
    paragraphs: [
      'The average adult now spends several hours a day looking at a phone. Apps are designed to be addictive: every notification, like and new video gives us a tiny reward and makes us want more.',
      'Some people have decided to cut back. They turn off most notifications, keep their phone in another room at night, or delete social media apps for a month. At first, they say, the urge to check the phone is strong. After a week or two, it becomes much weaker.',
      'People who try this often report that they sleep better and pay attention for longer. They read more books and notice small things around them that they used to miss.',
      'You do not have to give up technology completely. The idea is to use it on purpose, not by habit. Next time you come across a free moment, try doing nothing for a minute. It is harder than it sounds.',
    ],
  },
  {
    id: 'starter-car-free-cities',
    title: 'Cities without cars',
    focus: ['pedestrian', 'traffic jam', 'air pollution', 'opposed to', 'get used to', 'take over'],
    paragraphs: [
      'In many European cities, streets that were once full of cars now belong to pedestrians and cyclists. City centres in places like Oslo and Ghent have removed parking spaces and closed roads to most traffic.',
      'Supporters say the benefits are clear. There are fewer traffic jams, less noise and much lower air pollution. Cafés put tables where cars used to park, and children can play safely outside.',
      'At the beginning, many shop owners were strongly opposed to the changes. They worried that customers would stop coming. In most cases, the opposite happened: more people walking past meant more people stopping to buy something.',
      'Change is never easy, and drivers need time to get used to new rules. But once people experience a quiet, green street, few of them want the cars to take over again.',
    ],
  },
  {
    id: 'starter-naps',
    title: 'The science of a good nap',
    focus: ['nap', 'alert', 'drowsy', 'boost', 'make up for', 'groggy'],
    paragraphs: [
      'In some cultures, an afternoon nap is a normal part of the day. In others, people feel guilty for sleeping when the sun is up. Science suggests that a short nap can actually be very good for us.',
      'Around the middle of the afternoon, most people feel drowsy. This is a natural dip in our body clock, not just the result of a heavy lunch. A nap of ten to twenty minutes can boost our mood and help us stay alert for hours.',
      'The length is important, though. If you sleep for more than about thirty minutes, you may fall into deep sleep and wake up feeling groggy and confused.',
      'A nap cannot completely make up for a bad night, and people with sleep problems should be careful with it. But for most of us, a short rest is a cheap and simple way to get through a long day.',
    ],
  },
  {
    id: 'starter-adult-learner',
    title: 'Learning a language as an adult',
    focus: ['fluent', 'make progress', 'struggle with', 'stick with', 'mistake', 'confidence'],
    paragraphs: [
      'Many adults believe it is too late to learn a new language. Children, they say, just pick it up naturally. Research shows the story is more complicated. Adults often make progress faster at the start because they can understand grammar and use good learning strategies.',
      'Where adults struggle with languages is usually not the brain but the routine. Work, family and tiredness make it hard to stick with daily practice. Fear is another problem. Adults hate looking silly, so they avoid speaking until they feel ready, and that moment never comes.',
      'The learners who become fluent usually accept that every mistake is part of the process. They speak early, even with a small vocabulary, and they build confidence step by step.',
      'Short, regular practice beats long sessions once a week. Fifteen minutes a day, every day, is enough to change a lot in a year.',
    ],
  },
  {
    id: 'starter-fast-fashion',
    title: 'The hidden cost of fast fashion',
    focus: ['bargain', 'throw away', 'second-hand', 'come at a cost', 'impact', 'last'],
    paragraphs: [
      'A T-shirt for the price of a coffee sounds like a bargain. Fast fashion brands produce new collections every few weeks, and clothes have never been so cheap. But low prices come at a cost.',
      'Making clothes uses huge amounts of water and energy, and much of it happens in factories where workers earn very little. Because the clothes are cheap, we also treat them as disposable. Many people throw away items after wearing them only a few times.',
      'The environmental impact is enormous. Mountains of old clothes end up in landfill or are shipped to other countries, where most of them are never worn again.',
      'There are simple ways to do better. We can buy fewer, better-quality items that last longer, repair what we have, or shop second-hand. The most sustainable piece of clothing, experts say, is the one already in your wardrobe.',
    ],
  },
  {
    id: 'starter-small-talk',
    title: 'Small talk is not small',
    focus: ['small talk', 'awkward', 'break the ice', 'stranger', 'chat', 'bring up'],
    paragraphs: [
      'Chatting about the weather with a stranger in a queue may feel pointless. Many people find small talk awkward and try to avoid it. Yet studies suggest these short conversations matter more than we think.',
      'In one experiment, commuters were asked to talk to someone on the train instead of sitting in silence. Most expected the conversation to be uncomfortable. In fact, they reported a much more pleasant journey than those who kept to themselves.',
      'Small talk helps to break the ice. It shows that we are friendly and safe to talk to, and it often leads to deeper conversations. Colleagues who chat in the kitchen usually work together better later.',
      'If you are not sure how to start, ask a simple question about the situation you share, or bring up something you can both see. Most people are happier to talk than you expect.',
    ],
  },
]

export function starterTexts(now: number): ReadingText[] {
  return SEEDS.map((seed, index) => ({
    id: seed.id,
    title: seed.title,
    body: seed.paragraphs.join('\n\n'),
    origin: 'starter',
    focus: seed.focus,
    createdAt: now - index,
    updatedAt: 0,
    readAt: null,
    translation: '',
  }))
}
