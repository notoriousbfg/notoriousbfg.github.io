This past summer, like many thousands of others, I took part in Y-Combinator's "Startup School". For the un-indoctrinated, it's an online class for early stage startups.

I participated in eight of the ten weeks the class ran for, mostly because changing my focus to applying for jobs meant I couldn't give my full attention to what I was working on. My MVP had also slowed down to the point where just pushing code became a real chore. More on that later.

For context, the problem I'd chosen to work on was that of internal documentation for development teams. It was something I'd identified from years of working in creative agencies (where documentation is usually non-existent). Of the handful of companies working on this problem, I thought I could do better.

The format of the course consisted of weekly lectures, followed by video sessions with other founders. For the video sessions we were asked to describe our companies, the problems we were trying to solve and what we thought our greatest challenges were. At the end of the session we were prompted to share feedback via a form. To participate in the course, companies were also required to submit weekly updates, detailing things like how many users they'd spoken to, what their problems were, what their morale was like.

Many of the companies I spoke to during these video sessions (including mine) were in concept stage and hadn't launched or began trading, but I met some founders who'd sunk their lives and life savings into products that didn't have a market, founders who were about to relocate to Silicon Valley and founders who were entering into accelerators.

The video sessions themselves were fairly beneficial, with the exception of one or two. Quickly I realised I enjoyed discussion other founder's ideas, thinking critically and encouraging others, as much as I did my own. It was insightful to hear about how other founders had settled upon an idea, why they'd made certain assumptions about their market etc. The first session immediately made it clear to me that I needed to think more about how to describe what I was working to others (including the non-technical even though those people weren't my target audience). It even resulted in me changing my name from 'SlimDocs' to 'SwiftDocs'. Feedback from other developers in my first video call was also encouraging.

The first week's lectures particularly resonated with me because they forced me to think about my problem from the perspective of prospective users and investors.

- [How to Talk to Users](https://www.youtube.com/watch?v=MT4Ig2uqjTc)
- [How to Evaluate Startup Ideas (pt 1)](https://www.youtube.com/watch?v=DOtCl5PU8F0&feature=emb_title)

Following these, I approached some developer friends of mine to conduct user interviews. Though these were supposed to be limited to a few questions, they grew into hour-long conversations. It was clear to me that internal documentation was something developers had strong but varying opinions on and that the people I'd interviewed didn't believe a good solution existed, but it was important to focus on the problem and didn't stray into brainstorming solutions. The "How to Talk to Users" lecture outlined some particularly useful questions to ask. Of the ideas to come out of these discussions, my main takeaways were:
- Developers didn't feel it was their responsibility to write docs. This was merely a distraction from writing code. Time was the biggest obstacle to writing good documentation.
- The most value internal documentation provides is WHY certain decisions were made, not simply a description of how something works.
- Internal documentation can have several different audiences (technical and non-technical).
- Developers/Companies are willing to invest in products that save them time or provide a tangible benefit. (Who knew?)

It was important that I spend a week thinking about my problem at a granular level, especially who the stakeholders might be in documentation and what their interests were, before ploughing into an MVP. The second week's video session was particularly helpful in allowing me to do this. One particular piece of feedback I had was:

> "Think about the people who are required to produce documentation rather than trying to convince people that they should be doing it. Anything that automates a boring task is likely to have customers."

By the time the third week's video session had come around I was better able to describe what SwiftDocs was to other founders. At the suggestion of a founder in week two, I found some stats that helped better explain the problems I was trying to solve. For example:

> SwiftDocs is a code editor extension that helps development teams better understand their code. Having been a developer for the last 5 years, my experience is that codebases are typically poorly documented or not documented at all. As a result, it's much harder to bring new developers onto a project.

> - On average it takes 8-12 months for new employees to gain the same proficiency in their role as co-workers.
> - Lost productivity due to training new employees can cost a business up to 2.5% of their total revenue.

It was also around this time that I felt it was right to start working on an MVP. An early concept I'd come up with was a note-taking app that would index your repositories, allowing you to reference files and snippets of code as you typed. This idea seemed simple enough to execute on, but I wasn't comfortable with having to build features that apps like Notion and Confluence already supplied out of the box.

I was interested in the idea of coupling the code repository with the text editor. I thought there was opportunity in an idea that allowed you to write docs as easily as you could write code. The biggest obstacle was that indexing a code repo takes time and a repo could be infinitely large. I was curious as to whether there was a way developers could write explanations of their code within their editor, like code comments, but I thought there was potential to create larger structured "wikis" with grouped comments and tutorials. An unrelated idea I'd had was to simplify the code editor tree around only the areas of functionality you were working on (with monolithic codebases in mind).

I carried out some internet research, including searching on Product Hunt for products that aimed to solve similar problems and came upon CodeStream. Initially I was alarmed because their product was solving a problem close to my own and they were well-established (with several hundred thousand installs on multiple platforms) but from previous experience I knew it was best to ignore the notion that they had a total market share. Upon closer inspection I didn't feel that they'd captured the entire crux of the problem. I reached out to a friend who assured me that he'd used CodeStream and agreed there was more scope.

I decided to start working on a VSCode extension. I chose VSCode because it was the editor I currently use and knew there was already an ecosystem around writing extensions for it. They also had good documentation (hurrah!) To test some initial assumptions I had around the file tree, I wrote a basic extension in Javascript called 'File Tagger' (https://github.com/mrtrwhite/vscode-file-tagger).

In doing this, I found that VSCode's documentation used Typescript exclusively, as did the code examples. I decided to therefore take a few days to learn Typescript and familiarise myself with the different aspects of VSCode's API.

At first, building the functionality I'd set out for my extension seemed relatively straightforward. VSCode gives you an "Extension Development Host" (essentially just a Node server) which you simply refresh whenever you make code changes. On my 5 year old Macbook Air, this process was a memory hog and quite slow to work with.

One issue I ran into was how to structure my project. The documentation wasn't particularly clear on this, nor did I get a sense of best extension development practices.

As I moved on from the Tree View to working on the "Webview" part of the extension where most of my UI would exist (a Webview is essentially an Iframed HTML page), I also introduced React into the project. While composing my views was now much more manageable, it also required me to create a webpack config that handled two environments for both the front and back end. I chose to keep all my Webview functionality in a separate directory and compile my scripts into a Webview-specific file.

Another issue that arose from using React was how to manage state. I didn't want to introduce greater complexity with something like Redux, but whenever a Webview is "de-focussed" in VSCode, the client-side state would be cleared. Extensions can have their own internal memory to persist data, but this required me to call the vscode.setState method on componentDidUpdate, which wasn't super clean. Also, to send data to the server I would need to send an event with vscode.postMessage. I created a MessageBus class to encapsulate this functionality and create event listeners for these events within my application.

During week five's video session, I expressed doubts to the other founders about completing my MVP within a reasonable timeframe. Even were I to cut functionality from the extension, I still had a back end service to build. Something a non-technical founder suggested was to release my extension for free as open source. Initially I brushed the idea aside questioning how I was to possibly generate any revenue with a free product but in reality it made releasing a first version a little easier. I'd have to think about how I'd replace the backend functionality I'd planned to build and the idea of storing code snippets/annotations in a version-controlled JSON file seemed like a fairly robust approach.

It was frustrating to have to keep pushing back my launch. I wanted to adopt the YC ethos of "launch early", but I felt so constrained by time.

I attended week six and seven's video sessions and had to rethink how to describe what I was working on, now that it was going to be free. I received some morale-lifting feedback from other technical founders and was motivated to push on. Week seven's session was memorable because another founder (who was notably late and had poor audio quality because he was attending the session from a public cafe) thought it was appropriate to try to discredit my understanding of Javascript and we awkwardly bickered in front of the others. I don't think anyone really cared, but it soured the tone a little.

I admit that my interest in the video lectures had began to wane around this point and I got the same impression from other founders I'd spoken to. I did however enjoy ["How to Evaluate Startup Ideas (pt 2)"](https://www.youtube.com/watch?v=17XZGUX_9iM&feature=emb_title).

By week 8 I'd almost completely lost interest in continuing to work on my project and not surprisingly it was around this time I started to focus on finding another job, which naturally became a huge distraction from writing code. I would have loved to have finished building SwiftDocs, but it's currently in a private Bitbucket repo and about 75% complete. If you're reading this and think it's something you'd like to work on, message me and I'll get a public repo going. SwiftDocs now exists [on Github](https://github.com/notoriousbfg/vscode-swiftdocs) and I'll be committing to the repo there. Please contribute!

My biggest takeaway from Startup School would be to find a cofounder. Someone to share some of the workload and offer a little encouragement from time to time. Though I have no immediate plans to start a company, it continues to be an interest of mine. Perhaps I'll go back to one of the ideas I did finish, like Postkit.