// uploadcare.com/pricing

const plan = (n, part = '') => `.plans__grid > .plan-card:nth-child(${n})${part && ` ${part}`}`;
const planTop = (n) => [plan(n, '.plan-card__head'), plan(n, '.cta')];

export default [
  {
    kind: 'site', page: 'pricing', label: 'Pricing · Plans',
    title: 'The cursor runs across the plans, then switches to monthly',
    duration: 11, target: '.plans__grid', isolate: ['.plans'],
    // prices and buttons; the feature lists stay out of it
    css: '.plan-card__concept, .plan-card__features { display: none !important; }',
    cursor: [
      { t: 1.2, to: plan(1, '.plan-card__price'), move: 0.9 },
      { t: 2.0, to: plan(1, '.cta'), move: 0.5 },
      { t: 3.1, to: plan(2, '.plan-card__price') },
      { t: 3.9, to: plan(2, '.cta'), move: 0.5 },
      { t: 5.0, to: plan(3, '.plan-card__price') },
      { t: 5.8, to: plan(3, '.cta'), move: 0.5 },
      { t: 6.9, to: plan(4, '.plan-card__price') },
      { t: 7.7, to: plan(4, '.cta'), move: 0.5 },
      { t: 8.9, to: '#billing-period-tab-monthly', move: 0.8, click: true },
    ],
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
