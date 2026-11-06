"""Every Pulse threshold in one place (spec §2, Phase 2 prompt §3 and §5). Change numbers here only."""

FRESH_HOURS = 48  # younger posts show «در حال جمع شدن» and stay out of medians
MEDIAN_DAYS = 30
MEDIAN_FALLBACK_DAYS = 90  # when a group has fewer than MEDIAN_MIN_POSTS posts in MEDIAN_DAYS
MEDIAN_MIN_POSTS = 5
HEATMAP_DAYS = 90
SCORE_GREAT = 1.5
SCORE_GOOD = 1.0
SCORE_MID = 0.7
SKIP_TARGET = 70.0  # reel skip rate goal, percent
NOON_HOURS = range(11, 15)  # 11:00 to 14:59 Tehran
NIGHT_HOURS = range(18, 24)  # 18:00 to 23:59 Tehran
HEATMAP_MIN_POSTS = 3  # fewer posts: faded cell
STALE_HOURS = 6
KPI_DAYS = 7
SPARK_DAYS = 14
BRIEF_AFTER_HOUR = 8  # Tehran
MAX_TASKS = 3
SAME_AGE_MIN_DAYS = 5  # brief compares yesterday with earlier days at the same age only with this many days
WEAK_DAYS = 3  # brief's weakest post: non-fresh posts of the last 3 days

# Task rules (prompt §5): numbers they use.
NIGHT_SHARE = 0.5  # more than half of last week's reels at night
NIGHT_GAP = 0.10  # noon median beats night median by at least 10 %
WINNER_SCORE = 1.5
WINNER_DAYS = 3  # repeat_winner: best non-fresh post of the last 3 days
WINNER_REPEAT_DAYS = 2  # never name a post this rule named on either of the previous 2 days
SKIP_FIX = 78.0
SKIP_FIX_DAYS = 3
NO_SLIDE_DAYS = 7
TOP_PRODUCTS = 10
NEGLECT_DAYS = 14
COVER_REFRESH_CAP = 30  # single-post Zernio reads per day for covers outside the sync window
FULL_REFRESH_DAYS = 90  # pulse_sync --full
TASK_PRIORITY = ("first_second", "repeat_winner", "night_posting", "no_slide", "neglected_product", "friday")
