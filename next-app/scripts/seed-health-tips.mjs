// Seed 10 published health tips (one per topic), each attributed to a doctor
// that already exists in the database (round-robin over role="doctor" users).
// Plain ESM (no TS imports) so `node scripts/seed-health-tips.mjs` works directly.
//
// Idempotent: every tip upserts by its unique slug — re-running refreshes the
// copy and re-assigns the same author slot without duplicating rows, and
// keeps the original published_at date of rows that already exist.
//
// Usage: npm run db:seed-tips
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = ["health_tips", "wellness", "nutrition", "mental_health", "fitness", "general"];

const TIPS = [
  {
    slug: "sleep-better-tonight",
    category: "health_tips",
    title: "Sleep better tonight: a simple bedtime routine",
    excerpt: "A calm, regular wind-down is the most reliable way to fall asleep faster and wake up rested.",
    content: `Most adults need between seven and nine hours of sleep a night, yet sleep is the first thing we sacrifice when life gets busy. Short nights add up: weaker concentration, a shorter temper, and a harder time fighting off infections.

Try a fixed wind-down for two weeks. Stop screens 30 minutes before bed, dim the lights, and do something quiet — reading, stretching, or a warm shower. Go to bed and wake up at the same time, even on weekends, so your body clock stays steady.

Keep the bedroom cool, dark and quiet, and reserve it for sleep only. Avoid caffeine after mid-afternoon and heavy meals late at night. If you are still awake after 20 minutes, get up, do something calm in dim light, and return when you feel sleepy.

Snoring, gasping during sleep, or morning headaches that never go away can be signs of sleep apnea. Book an appointment and we can talk it through.`,
  },
  {
    slug: "drink-water-every-day",
    category: "wellness",
    title: "Drink water every day: how much is enough?",
    excerpt: "Staying hydrated keeps your energy, kidneys and digestion working — and the answer is simpler than you think.",
    content: `Water carries nutrients to your cells, flushes waste through your kidneys, and helps you stay alert. Most people do fine aiming for six to eight glasses a day, but your needs change with the weather, your job and how active you are.

A practical rule: drink a glass with every meal and another with each snack or tea break. Check the colour of your urine — pale straw means you are on track; dark yellow means catch up. Heavy sweating, fever, vomiting or diarrhoea all raise your needs, so drink more and consider an oral rehydration solution if you are losing a lot of fluid.

Plain water is best. Sugary sodas and juices add calories without filling you up, and too much caffeine can make you jittery. If you find water boring, a slice of lemon, cucumber or a sprig of mint makes it easier to sip.

Rarely, very heavy water intake can be a sign of a medical problem. If you are constantly thirsty no matter how much you drink, book an appointment.`,
  },
  {
    slug: "balanced-plate-method",
    category: "nutrition",
    title: "Build a balanced plate in four easy steps",
    excerpt: "No calorie counting needed — half vegetables, a quarter protein, a quarter carbohydrates does the job.",
    content: `Healthy eating does not have to mean weighing food or banning the dishes you love. The plate method is a visual shortcut that works almost everywhere, including rice-and-stew dinners and restaurant plates.

Fill half your plate with vegetables or fruit. Put a quarter with a protein source — beans, eggs, fish, chicken or lean meat. Use the last quarter for a starchy food such as rice, ugali, pasta or potatoes, and choose whole grains when you can.

Eat slowly and stop when you are comfortably full; it takes about 20 minutes for your brain to register satisfaction. Drink water with the meal instead of sugary drinks. Season with herbs, spices, lemon and a little salt rather than heavy sauces.

One plate will not make or break your health — patterns do. If you have diabetes, kidney disease or you are pregnant, talk to us first so the plan fits your condition.`,
  },
  {
    slug: "manage-stress-every-day",
    category: "mental_health",
    title: "Everyday stress: five minutes that actually help",
    excerpt: "Small daily resets keep stress from turning into headaches, poor sleep and high blood pressure.",
    content: `Stress is normal — but when it runs all day, the body stays in alert mode. That can show up as tight shoulders, headaches, irritability, comfort eating, or trouble falling asleep.

Give your nervous system a few short breaks. Breathe out longer than you breathe in: in for four counts, out for six, for one minute. Stand up, stretch, or take a short walk — movement tells your body the threat has passed. A quick note of three things that went well today also rewires your focus over time.

Protect the basics: regular sleep, a meal you actually sit down for, and one small thing each day that is purely for you. Say no to one commitment a week if your calendar is full. Talk to someone you trust — saying the worry out loud shrinks it.

Stress that will not lift, panic attacks, or losing interest in things you used to enjoy deserve an appointment. Mental health is health, and treatment works.`,
  },
  {
    slug: "move-thirty-minutes-a-day",
    category: "fitness",
    title: "Move for 30 minutes a day (without a gym)",
    excerpt: "Three ten-minute walks count just as much as one long session for your heart, mood and joints.",
    content: `You do not need a gym membership to stay active. Aim for 150 minutes of moderate activity a week — about 30 minutes on most days. If that sounds like a lot, split it: a 10-minute walk after each meal adds up to exactly that.

Moderate means you can talk but not sing: brisk walking, cycling on flat ground, dancing, swimming, or heavy housework and gardening. Two days a week, add strength work — squats, push-ups against a wall, carrying shopping — to protect your bones and muscles as you age.

Start smaller than you think you should and add five minutes a week. Take the stairs, get off one stop early, walk while you phone a friend. Consistency beats intensity every time.

Chest pain, dizziness, or breathlessness that is unusual for you means stop and seek care. If you have a chronic condition or recent surgery, ask us what level of activity is safe first.`,
  },
  {
    slug: "know-your-blood-pressure",
    category: "health_tips",
    title: "Know your blood pressure numbers",
    excerpt: "High blood pressure usually has no symptoms at all — the only way to know is to measure it.",
    content: `High blood pressure is called the silent killer for a reason: most people feel nothing while it quietly strains the heart, kidneys and blood vessels. The only way to catch it is to check.

A reading is written as two numbers, like 120 over 80. Around 120/80 is ideal for most adults; persistently at or above 130/80 counts as high and is worth acting on. One high reading does not diagnose anything — stress, coffee or a rushed visit can raise it — but repeated high readings are a conversation to have.

You can help yourself before medicine ever enters the picture: cut back on salt, eat more vegetables, move most days, keep a healthy weight, limit alcohol, and stop smoking. If you already take medicine, take it every day even when you feel fine — that is exactly when it is working.

Check your pressure at least once a year, and more often if it has been high before. Bring your home readings to your appointment; they are more useful than a single clinic number.`,
  },
  {
    slug: "hand-washing-stops-germs",
    category: "health_tips",
    title: "Hand washing: the cheapest way to stop germs",
    excerpt: "Twenty seconds with soap before meals and after the bathroom prevents most colds, stomach bugs and skin infections.",
    content: `Your hands touch your face, your food and everything else — which makes them the main route for germs to travel. Washing them properly is the single most effective habit for avoiding coughs, colds, diarrhoea and wound infections.

Wet your hands, apply soap, and rub every surface — palms, backs, between the fingers and under the nails — for at least 20 seconds. A simple timer: hum "Happy Birthday" twice. Rinse well and dry completely, because germs pass more easily from damp skin.

Wash before eating or preparing food, after the bathroom, after touching rubbish, and after caring for someone who is unwell. When there is no soap and water, an alcohol-based hand rub is a good second choice — but not when hands are visibly dirty or greasy.

Teach children the same routine; they catch and spread more infections than adults. If you or a family member keep getting infections, book an appointment to look for an underlying cause.`,
  },
  {
    slug: "screen-breaks-for-tired-eyes",
    category: "wellness",
    title: "Screen breaks for tired eyes (the 20-20-20 rule)",
    excerpt: "Headaches, dry eyes and neck pain after screen time are preventable with one simple rule.",
    content: `Staring at a screen makes you blink about half as often as normal, so the eyes dry out, and the fixed focus tires the focusing muscles. The result is tired, gritty eyes, headaches, and sometimes blurred vision by evening.

Follow the 20-20-20 rule: every 20 minutes, look at something at least 20 feet (six metres) away for 20 seconds. Blink fully a few times while you do it. Set a reminder until it becomes automatic.

Set up your workspace too: screen an arm's length away, top of the screen at or just below eye level, and increase the text size instead of leaning in. Reduce glare by angling the screen away from windows, and keep your device brightness close to the room's light.

If your vision stays blurry, or you get eye pain, redness or rainbows around lights, get your eyes checked — some eye conditions start without any pain at all.`,
  },
  {
    slug: "when-to-ask-for-help",
    category: "mental_health",
    title: "When mood changes: it is okay to ask for help",
    excerpt: "Feeling low for more than two weeks is not weakness — it is a reason to book an appointment.",
    content: `Everyone has sad or anxious days. What deserves attention is when the low mood, worry or emptiness stays most of the day, nearly every day, for two weeks or more — especially if it starts pulling you away from work, school, sleep, food or people you care about.

Other signals: losing interest in things you used to enjoy, sleeping far too much or too little, feeling worthless or guilty, difficulty concentrating, or thoughts of not wanting to be alive. If you have thoughts of self-harm, tell someone you trust today or contact emergency services — you do not have to carry that alone.

Asking for help is a practical step, not a character flaw. Talking therapies work, medication helps many people, and both are more effective the earlier they start. Bring a short note of when it began and how it affects your days — it makes the first appointment much more useful.

Support matters too: keep a routine, move your body, stay connected with one or two people, and reduce alcohol. Recovery is rarely a straight line, but it is real.`,
  },
  {
    slug: "sun-safety-for-healthy-skin",
    category: "general",
    title: "Sun safety for healthy skin all year",
    excerpt: "A daily habit of shade, clothing and sunscreen prevents sunburn now and skin cancer later.",
    content: `Ultraviolet light damages skin cells cumulatively — the burn you remember is only part of the story. Most sun exposure happens on ordinary days: walking to work, waiting for a matatu, sitting near a window. Protection is a daily habit, not a beach accessory.

Use a broad-spectrum sunscreen of SPF 30 or higher on exposed skin every morning, and reapply every two hours when you are outdoors, or after swimming and sweating. Cover up with a hat, sunglasses and long sleeves in the middle of the day (roughly 10am to 4pm), and seek shade when you can.

Babies under six months should stay out of direct sun entirely. Watch your own skin too: a mole that changes shape, colour or size, or a sore that will not heal for more than a few weeks, deserves a check.

A little unprotected time each day adds up, but so does protection — the skin never really forgets, and it can still repair a lot when you start.`,
  },
];

function slugIsSafe(tip) {
  return tip.slug.length <= 220 && tip.title.length <= 200 && CATEGORIES.includes(tip.category);
}

async function main() {
  const doctors = await prisma.user.findMany({
    where: { role: "doctor" },
    orderBy: { id: "asc" },
    select: { id: true, first_name: true, last_name: true },
  });
  if (doctors.length === 0) {
    console.error("No doctor users found — create doctors first (npm run db:seed / register a doctor).");
    process.exit(1);
  }
  for (const tip of TIPS) {
    if (!slugIsSafe(tip)) {
      console.error(`Invalid tip payload: ${tip.slug}`);
      process.exit(1);
    }
  }

  const now = Date.now();
  let created = 0;
  let updated = 0;

  for (const [index, tip] of TIPS.entries()) {
    const author = doctors[index % doctors.length];
    const authorId = author.id;
    const authorName = `Dr. ${author.first_name} ${author.last_name}`;
    const data = {
      title: tip.title,
      excerpt: tip.excerpt,
      content: tip.content,
      category: tip.category,
      published: true,
      author_id: authorId,
    };
    // Newest tip first in the feed: stagger published_at one day apart.
    const publishedAt = new Date(now - (TIPS.length - index) * 24 * 60 * 60 * 1000);

    const existing = await prisma.article.findUnique({ where: { slug: tip.slug }, select: { id: true } });
    if (existing) {
      await prisma.article.update({ where: { id: existing.id }, data });
      updated += 1;
      console.log(`updated  ${tip.slug} — ${authorName}`);
    } else {
      await prisma.article.create({ data: { ...data, slug: tip.slug, published_at: publishedAt } });
      created += 1;
      console.log(`created  ${tip.slug} — ${authorName}`);
    }
  }

  const publishedCount = await prisma.article.count({ where: { published: true } });
  console.log(
    `Health tips seed complete: ${created} created, ${updated} updated, ${publishedCount} published articles total ` +
      `(authors spread over ${doctors.length} doctor${doctors.length === 1 ? "" : "s"}).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
