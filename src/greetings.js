/**
 * The sheet greets Noël by name, then says what changed.
 * Two lines, not one: the name is the welcome, the state is the news.
 */
export function greeting({ open, today, waiting, pressing, innovationCold }) {
  const h = new Date().getHours()
  const part = h < 5 ? 'late' : h < 11 ? 'morning' : h < 18 ? 'afternoon' : 'evening'

  const leads = {
    late:      ['Still up, Noël', 'Late one, Noël'],
    morning:   ['Morning, Noël', 'Welcome back, Noël'],
    afternoon: ['Afternoon, Noël', 'Welcome back, Noël', 'Back at it, Noël'],
    evening:   ['Evening, Noël', 'Welcome back, Noël']
  }[part]

  const news = []
  if (pressing > 0) news.push(`${pressing} order date${pressing > 1 ? 's' : ''} need you before anything else.`)
  if (today > 5) news.push(`Today is carrying ${today}. That is not a day.`)
  if (today === 0 && open > 0) news.push('Nothing is scheduled for today yet.')
  if (waiting >= 3) news.push(`${waiting} things are sitting with other people.`)
  if (innovationCold >= 21) news.push(`Innovation has not moved in ${innovationCold} days.`)
  if (open === 0) news.push('Clean sheet.')

  const d = new Date().getDate()
  return { lead: leads[d % leads.length], state: news.length ? news[0] : null }
}
