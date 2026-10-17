At a company I once worked for, I had the great displeasure of working with someone who had decided fairly early on they didn't like me. All attempts I made to try to repair the relationship over the course of months, years even, failed. They were particularly combative over any form of code review, telling me that to criticise their work was to criticise their ability personally.

I had learned earlier in my career that my professional worth was not intrinsically tied to every piece of work I did. As soon as I heard, "But Tim, you know I put so much of myself into my work, how can I possibly not take it personally?", I was listening to my own voice five years prior. It's a cowardly stance because you're effectively telling everyone else to go fuck themselves rather than work on yourself.

So, in some ways I empathised with my colleague. I spent a great deal of time and effort thinking about how I might best work around their behaviour, their reactivity.

Ultimately, it just didn't work. I gave so much of myself trying to adapt *my* process, *my* behaviours. I asked for advice on Hacker News. I asked for help from friends. I couldn't control, or dare I say *influence*, how my colleague felt and it completely sapped my desire, my love of the craft. I resented the thought of coming to work on a Monday. In part this was also due to my manager at the time's indifference to the matter, [creating a culture](https://notoriousbfg.com/the-impact-of-culture/#the-actions-of-leaders) in which behaviours like my colleague's were acceptable.

While not perfect, I eventually settled on only offering feedback in the form of questions: "Might writing it like this have the benefit of that?", for example. This worked a bit better than any of the other approaches and is the one I have taken for any feedback I have since given. It has the benefit of making you not sound like a prick, even if you have no intention of sounding like one. I have since had the great pleasure of working with some truly lovely people who aren't generally bothered by "difficult" feedback.

Recently I was reviewing a rather long merge request. The title hadn't been changed from the one Github generates, there was no description and there were hundreds of file changes over twenty or so files. I tend to feel slightly self-aware if giving ten or more comments but if there is good reason to give feedback I will give it.

Having tried to rephrase one particular question a number of times, I decided that instead I would phrase it as a command e.g. "Write it like this so that you have the benefit of that". It changed the tone entirely, but I had just become so fed up with being so... 

...so fucking considerate all the time?

Like Software Engineers worldwide I now spend much more of my day reviewing the code of others instead of writing my own. In a recent conversation I mentioned how I've long thought of readability, consistency and performance to be the most important qualities in the code that I review. Does code even need to be readable any more, if nobody's actually reading it? Well, nobody with a pulse. The machines will always understand it regardless. Should we be writing tiny programs again, so as not to blow our token budgets?

What's even the point of code reviews anymore?

People have always been shitty but at least before AI, we *sometimes* made an attempt to hide it. We were courteous in how we approached the review process: We'd write helpful commit messages; We'd split our many code changes into several MRs; We'd give them a description, perhaps some background or testing notes. Not because we were *obliged* to, but because it was in our interest for the reviewer to understand what they were looking at. The end product comes out better, right? Everybody wins.

And the code itself? Well, it's just not a plate of food I enjoy eating anymore: with the chicken, and the [roasties](https://notoriousbfg.com/feed/perfect-roasties/) and the green beans, the carrots and maybe some gravy. Each with its own distinct appearance and flavour. Instead I'm being served that meal replacement stuff people drink. Huel. All of it Huel. No flavourings, just one homogenous, tasteless liquid. Maybe if I'm lucky I'll find a blueberry at the bottom. Yes, I remember what blueberries used to taste like: sweet and sometimes a little bitter. Imagine eating (drinking?) Huel three times a day. That's what reviewing LLM code feels like, and my peers expect me to act like they really wrote it, to pretend. I'm expected to pretend this bland liquid is a delicious cooked meal.

I'm not saying "let's not use AI at all" (because most conversations about using it seem to degenerate to ["should be using AI or not? yes we should"](https://notoriousbfg.com/no-smoking-gun/)) and I'm not going to try prove to you that I really do love AI by showing you [all the things](https://notoriousbfg.com/hole-punch/) I made with it. I'm just saying the behaviours we used to consider "fairly inconsiderate" when offering code up for review seem to have been exaggerated by the sheer amount of code we're now putting out, a blind trust that "the LLM probably knows what it's doing better than I do", and an over-reliance on speed over quality.

Perhaps some of the ways we worked before weren't *totally* misguided?



