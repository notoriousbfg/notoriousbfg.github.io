A colleague of mine has repeatedly called for some of the controllers in our project to be refactored. He says they're messy, but what I think he means is that they're hard to understand. At first glance they do seem complex yes but upon closer inspection:

- There are step-by-step instructions in the comments explaining what's going on.
- Variable and method names are descriptive but not overly verbose.
- The code is spaced, formatted and indented correctly.

I can see why my colleague might see the code this way; it does have multiple concerns, but it came to be this way iteratively over the course of two years. Everything it does relates to a previously-defined requirement i.e. it does what it's supposed to. We also haven't made any changes to it for several months because it hasn't caused any bugs nor are there any major performance bottlenecks.

One common developer bias is that old code is bad. You've never heard anyone say the phrase "legacy code" without contempt in their tone. I can appreciate that sometimes old code doesn't conform to newer practices agreed on by a team. For example, legacy PHP code might use the now-deprecated PSR-2 standard, but the tech lead might want everyone to write PSR-12. But is this really a good enough reason to potentially jeopardise a piece of working functionality?

I think the reason old code is often seen this way is because it takes longer to remember. Developers yearn for clarity but if they're not immediately able to recall [under what circumstances some code was written](/building-software-sharing-knowledge) (in a few seconds or less), they only see ambiguity.

![Code Age vs Time To Recall](/img/time_to_recall.jpg)

Even when we talk about code, when we're able to recall previous conversations/decisions/motivations quickly, we can talk about it confidently and convey to others that we understand it well. Unfortunately saying, "I need five to ten minutes to refresh my memory of this" doesn't convey the same sense of confidence. Always prepare.

Part of the solution to reducing this "time to recall" is through better internal documentation. We use a tool like Codestream but I'll admit that context is not always captured; sometimes it's the "why" not the "what" that's relevant. In my opinion, good old-fashioned comments work best; I try to write mine like a numbered set of instructions. Of course you can also convey meaning with your git commit message.

The other part of the solution is to agree as a team under what circumstances code should be refactored. If your team collectively agrees that stable, well-documented code should be refactored, run.
