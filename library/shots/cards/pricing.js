// uploadcare.com/pricing

const plan = (n, part = '') => `.plans__grid > .plan-card:nth-child(${n})${part && ` ${part}`}`;
const planTop = (n) => [plan(n, '.plan-card__head'), plan(n, '.cta')];

export default [
  {
    kind: 'site', page: 'pricing', label: 'Pricing · Plans',
    title: 'Each plan lights up in turn, then the prices switch to monthly',
    duration: 11, target: '.plans__grid', isolate: ['.plans'],
    // prices and buttons; the feature lists stay out of it
    css: '.plan-card__concept, .plan-card__features { display: none !important; }',
    // the (unseen) pointer rests on each plan's name, price and description,
    // drifting a little across it, never on the buttons
    cursor: [1, 2, 3, 4].flatMap((n, i) => [
      { t: 1.2 + i * 1.9, to: plan(n, '.plan-card__head'), at: [0.35, 0.5], move: i ? 0.7 : 0.9 },
      { t: 2.4 + i * 1.9, to: plan(n, '.plan-card__head'), at: [0.6, 0.62], move: 1.1 },
    ]).concat({ t: 8.9, to: '#billing-period-tab-monthly', move: 0.8, click: true }),
    views: {
      landscape: [{ t: 0, el: ['.plans__toggle', ...planTop(1), ...planTop(4)], pad: 70 }],
      portrait: [
        { t: 0, el: planTop(1), pad: 36 },
        { t: 2.3, el: planTop(2), pad: 36 },
        { t: 4.2, el: planTop(3), pad: 36 },
        { t: 6.1, el: planTop(4), pad: 36 },
        // the toggle and a price, close enough to read the switch
        { t: 8.1, el: ['.plans__toggle', plan(3, '.plan-card__head')], pad: 30, dur: 1.1 },
      ],
      square: [
        { t: 0, el: planTop(1), pad: 90 },
        { t: 2.3, el: planTop(2), pad: 90 },
        { t: 4.2, el: planTop(3), pad: 90 },
        { t: 6.1, el: planTop(4), pad: 90 },
        { t: 8.1, el: ['.plans__toggle', plan(3, '.plan-card__head')], pad: 60, dur: 1.1 },
      ],
    },
  },
];
