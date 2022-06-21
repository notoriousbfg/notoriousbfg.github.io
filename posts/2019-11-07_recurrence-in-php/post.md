Earlier this year I spent many months working on a web app for a client. Without giving too much away, one of the requirements was that the app gave users the ability to create recurring events. These would need to be scheduled weekly, biweekly (with specific dates), monthly, bimonthly and annually.

If you search for "software architecture recurring events" (or something to that effect), you'll most likely come across [this Stack Overflow answer](https://stackoverflow.com/questions/5183630/calendar-recurring-repeating-events-best-storage-method/5186095#5186095). The approach it describes seems like it should work, but it's hard to tell merely from reading the code whether it's a good solution.

Having spent many days trying this solution (and many others) the best method for creating recurring events I could find was to use the iCalendar RRule standard.

The RRule is a written as a semicolon-separated string of key-value pairs that describe different parts of the recurrence pattern. It's especially useful because it allows for irregular intervals and specific dates. For example, the following describes an event that occurs on Monday biweekly.

> FREQ=WEEKLY;BYDAY=MO;INTERVAL=2

The following describes an event that occurs on the 12th of every month.

> FREQ=MONTHLY;BYMONTHDAY=12;INTERVAL=1

In PHP, I found the [When](https://github.com/tplaner/When) library to be the easiest way to generate a range of dates with RRules. We can restrict our ranges with a start and end date too.

Traditionally when building a calendar application, you'd generate recurring events dynamically and view them on a calendar-like interface so that your events would appear to reoccur indefinitely. In my app however, future events would have associated data and therefore need to be queried against in a database, so as to avoid holding everything in memory.

I chose to design a scheduled daily process that would generate recurring events for up to a year at a time and store them in the database. If an RRule interval occurred on the current day, a new interval row would be added to the database for a year's time.

The purpose of this post was to help others should they ever find themselves in a similar position. Having spent a great deal of time trialling several different ideas, this was the one that allowed me to come closest to a fairly efficient, working solution.