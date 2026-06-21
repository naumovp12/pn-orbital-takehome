# Written Question Submission by Pasha Naumov

Some context before I start, which will make sense later:
- My current company, Zoa (now part of ENSEK), focuses on home energy management optimisation systems for solar devices and EVs. We connect to users' smart energy devices, gather their usage data, and optimise it against tariffs by telling devices when to charge, discharge or export electricity - saving users money.
- Octopus is the UK's most popular energy supplier for customers with these devices, with good rates, incentives and strong tech capabilities for power users.
- Customers = customers of Zoa - companies purchasing our products and services.
- Consumers = customers of our customers - the end users of our products.
- We run a microservice architecture on GCP (Koa, K8s) and a white-label universal app shared across web and native (Next.js, Expo/React Native).

## 1. Problem & context

In February 2024, Zoa decided to pivot from internal tools for energy suppliers to a B2B2C model. The idea: customers (companies) use our app so their own customers (consumers) can optimise their devices against tariffs. This was possible because Zoa had inherited years of training data from Bulb, which we used to build an "optimisation engine" - software that looks at usage data and tariffs and decides whether a device should charge, discharge or export at any given time.

This pivot came with a 60% headcount cut, to become leaner. We also had our first commercial contract lined up for early May, which gave us roughly 12 weeks (May 2024) to rebuild the product. So the problem was: how do we build a fairly complex system that ingests device data, aggregates it, feeds it into the optimisation engine, and shows the result to end users in a white-label app - in 12 weeks, with a smaller team? This mattered a lot. After cutting 60% of the team, there was no room left to miss this deadline. Delivering this contract was proof that the pivot itself could work - not just for this one client, but for the company as a whole.

This was also before AI coding agents became widely used, so most of the work had to be planned and written by hand. We did use AI for some coding, but mostly for copy-paste type tasks.

## 2. Complexity & constraints

The main constraints were time, people and novelty. 12 weeks, with fewer engineers who had never built anything like this before, meant we had to be ruthless about what we prioritised, while still keeping the basics in place - testing, observability, and enough communication to stay aligned.

I was part of the "data layer" team. On the backend, this meant connecting to users' devices through a cloud API, collecting usage data every 5 minutes in a durable way, normalising it, and sending it downstream through a message queue. We supported three OEM brands in this first version: Solax, Solis and GivEnergy. On the frontend, it meant building the onboarding flow - the first thing users see after signing in - where they enter their device credentials (API key, serial number), get guided through linking steps, and link their tariff. Without this, optimisation isn't possible at all.

The team was 4 engineers (including me), a designer, an EM and a PM. The backend part was led by an experienced staff engineer, and as one of the ICs I took part in all the planning and discussions. The frontend onboarding flow was mine to lead - I had the most frontend experience on the team, so I had to make it robust enough, but also simple enough that more backend-leaning teammates could contribute too.

Two of the three OEMs were Chinese, which meant poor documentation, questionable API behaviour (like returning 200s on failures), and breaking changes with no warning. Every battery also behaved a bit differently, so we relied on one "design partner" device per OEM and a lot of trial and error. On-call during this period was pretty chaotic - I took the first on-call rotation together with the staff engineer, which made for a very fun week. In the end we ironed things out and shipped at roughly an 80/20 level, with a solid set of tests covering the main paths. It also gave us a lot of data on how set up our on-call processes.

## 3. Approach & trade-offs

**Temporal vs PubSub + Saga** For polling device data every 5 minutes, we needed something that could reliably replay steps if something failed. We went with Temporal. We also looked at GCP PubSub with a hand-built Saga pattern, but that meant building our own state store, idempotency locks, and retry/compensation logic from scratch. Temporal gave us all of that out of the box. Self-hosting and scaling a Temporal cluster is somewhat of a pain, but given the timeline, it was the right choice. The team was also the most comfortable using Temporal so this was a pragmatic choice that favoured velocity.

**Finite State Machine vs React Context** The onboarding flow needed a clear decision tree: if event A succeeds, go to event B, and each event had its own sub-paths and outcomes. This matched well with the Saga pattern used on the backend, which made it easier for the team to reason about both sides together. I suggested using a Finite State Machine to map out every possible state and compensation step. State machines aren't common in most frontend teams, so there was a real trade-off: more robust, but a steeper learning curve and slower onboarding than something more familiar like React Context with more ad-hoc handling. We had to decide quickly, so I built the initial scaffolding myself to help the team understand the concept rather than just explain it. It took us a couple of days to get to grips with it but the onboarding flow is still in the apps even now, which has proved to be the right choice. 

**Octopus-only integration vs a full tariff system** We made a conscious choice to only integrate with Octopus at launch, since they were the most popular and most tech-enabled provider and covered 100% of our pilot customers at the time. However, we still needed a fallback for users who weren't with Octopus. The choice was between a proper tariff database with its own handlers, integration and tests, or something cruder like simply showing a Webview with a Google Sheets form. Given how little time we had, the full database made less sense. So I suggested a middle ground: a simple manual-input UI that pushed the data to BigQuery and pinged a Slack channel whenever a new row came in. Read speed didn't matter here, so this was good enough. I built it in an evening, after talking it through with the EM, PM and design.

**Cutting to 80/20** As the lead on the frontend part (or what I'd do with any project to be honest), I had to cut scope down to the 80/20 - the 80% of the result that mattered, for 20% of the effort. We knew time was tight, so we cut anything that wasn't essential, like animations and UI polish. The goal was an onboarding flow that worked and looked decent enough - and that's what we shipped. The product reached its proper shape by the third iteration after release, but the first version did the job for that stage. I also handled the release itself - running QA sessions, coordinating people, and fixing bugs quickly as they came up.

## 4. Impact

We delivered the contract on time. Our first client, Glowb, was happy with the app and with making optimisation possible for their users - onboarding hit 100% completion in that first release, across roughly 30 households in the pilot. The contract itself was six-figure ARR, became a case study for the business, and - along with the rest of what the team delivered that year - played a part in Zoa being acquired later in 2024, as a company with a strong product and a team that could deliver under pressure.

Beyond the numbers, this was one of the most rewarding stretches of my time at Zoa. I got better at prioritisation and leadership skills, and it earned me real trust from the team as someone who could take an ambiguous, time-boxed problem and just deliver.

## 5. Reflection

Domain modelling took a bit of a hit - that's actually my biggest regret looking back. Under time pressure, we cut corners on a few domain models, and some of those decisions still cost us today. The tariff model in particular got so unwieldy that we've had to refactor it twice since. Same with how solar and generation products are linked - some of the assumptions we made aren't true anymore, and we still have to work around them through extra joins, with a proper refactor still on the to-do list.

I'd also push for more visibility and comms across teams. We kept teams focused to avoid the "too many cooks" problem, but it created silos - at times even I didn't have full visibility into what other teams were doing, which isn't great for a company our size.

Last but definitely not least, if I did this again today, in 2026, I think AI coding agents would actually help with both of these. With less time spent writing boilerplate by hand, we'd have more room to slow down on the domain modelling instead of rushing it, and more room to keep other teams properly in the loop instead of just pushing through to the deadline. This would be a game-changer now.
