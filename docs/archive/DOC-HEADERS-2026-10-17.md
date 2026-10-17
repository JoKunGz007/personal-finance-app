# Decision log and gotchas headers — archive to 2026-10-17

The header text of `DECISIONS.md` and `GOTCHAS.md`, moved here unchanged on 2026-10-17 (from commit `0a61779`) when both headers were cut to a few lines. Entries, traps and indexes did not move.

## `DECISIONS.md` header

This file carries **D-141, D-158 and D-273 … D-286** — the two open questions this file has
named since the twelfth boundary, the newest entries, and the twentieth boundary's own record of
itself (D-286). **D-141**:
whether the mailbox source is deleted after import, deferred by the owner. **D-158**:
`list_match_candidates`' unbounded scan, recorded in its own migration and unfixed. `scripts/check-docs.mjs`
pools this file with every archive and checks ids for duplicates and omissions across the whole set,
so the ids stay whole and the maintained file has never been required to be contiguous. Thirteen
settled ranges were relocated unchanged, not rewritten: **D-001 … D-059** to
[`docs/decisions/ARCHIVE-D-001-D-059.md`](docs/decisions/ARCHIVE-D-001-D-059.md) on 2026-08-09,
**D-060 … D-113** to [`docs/decisions/ARCHIVE-D-060-D-113.md`](docs/decisions/ARCHIVE-D-060-D-113.md)
on 2026-08-18, **D-114 … D-119** to
[`docs/decisions/ARCHIVE-D-114-D-119.md`](docs/decisions/ARCHIVE-D-114-D-119.md) on 2026-08-19,
**D-120 … D-129** to [`docs/decisions/ARCHIVE-D-120-D-129.md`](docs/decisions/ARCHIVE-D-120-D-129.md)
on 2026-08-23, **D-130 … D-133** to
[`docs/decisions/ARCHIVE-D-130-D-133.md`](docs/decisions/ARCHIVE-D-130-D-133.md) on 2026-08-24,
**D-134 … D-140** to [`docs/decisions/ARCHIVE-D-134-D-140.md`](docs/decisions/ARCHIVE-D-134-D-140.md)
on 2026-08-25, **D-142 … D-152** to
[`docs/decisions/ARCHIVE-D-142-D-152.md`](docs/decisions/ARCHIVE-D-142-D-152.md) on 2026-08-26,
**D-154 … D-156** to [`docs/decisions/ARCHIVE-D-154-D-156.md`](docs/decisions/ARCHIVE-D-154-D-156.md)
on 2026-08-27, **D-157 … D-163 without D-158 and D-161** to
[`docs/decisions/ARCHIVE-D-157-D-163.md`](docs/decisions/ARCHIVE-D-157-D-163.md) the same day,
**D-153 with D-164 … D-168** to
[`docs/decisions/ARCHIVE-D-153-D-168.md`](docs/decisions/ARCHIVE-D-153-D-168.md) on 2026-08-29,
**D-161 with D-169 and D-170** to
[`docs/decisions/ARCHIVE-D-161-D-170.md`](docs/decisions/ARCHIVE-D-161-D-170.md) on 2026-09-01, and
**D-171 … D-176** to
[`docs/decisions/ARCHIVE-D-171-D-176.md`](docs/decisions/ARCHIVE-D-171-D-176.md) the same day, and
**D-177 … D-197** to
[`docs/decisions/ARCHIVE-D-177-D-197.md`](docs/decisions/ARCHIVE-D-177-D-197.md) — begun on
2026-09-04 without **D-179 … D-181, D-183 and D-184**, which were fenced by an unfinished reading;
**completed to D-186 on 2026-09-13** when the budget asked and that fence had already been
discharged; and **extended to D-197 on 2026-09-16** (the fifteenth boundary, D-198), on the owner's
direct word rather than an argument or a reading, since every entry added was already settled,
shipped and confirmed live; and **D-198 … D-211** to
[`docs/decisions/ARCHIVE-D-198-D-211.md`](docs/decisions/ARCHIVE-D-198-D-211.md) on 2026-09-23
(the sixteenth boundary, D-213), again on the owner's direct word; and **D-212 … D-222** to
[`docs/decisions/ARCHIVE-D-212-D-222.md`](docs/decisions/ARCHIVE-D-212-D-222.md) on 2026-09-25
(the seventeenth boundary, D-227), on the owner's word too; later boundaries add **D-223 … D-234** (D-239), **D-235 … D-244** (D-251) and
**D-245 … D-258** to [`docs/decisions/ARCHIVE-D-245-D-258.md`](docs/decisions/ARCHIVE-D-245-D-258.md)
on 2026-10-11 (the twentieth boundary, D-267), and **D-259 … D-272** to
[`docs/decisions/ARCHIVE-D-259-D-272.md`](docs/decisions/ARCHIVE-D-259-D-272.md) on 2026-10-17 (the
twenty-first boundary, D-286). The index below covers every file, so a reader can find any
entry without opening any body.

**Every boundary sits where an argument ends rather than where a number is round**, and the fourth one is the clearest case of that rule so far. It was taken at **93%** of this file's byte budget and moved the whole arc in which both readers went to Cloud Vision and the local OCR engine was deleted. **The third boundary had explicitly refused to move D-120**, on the grounds that whether pre-fill stays was undecided and that question attached to D-120 and D-129 — which was true when written. **What closed it was not an argument but a shipped feature**: D-135 files a machine-read amount into the ledger without the owner looking at it at all, which is a stronger commitment than the trial ever asked for. *A question is closed when the code has stopped asking it*, and that is the test to apply at the next boundary rather than re-reading the prose.

**What this file now holds is two open questions, the newest entry and the record of the boundary
that just ran.** The mailbox archive (D-141) and the unbounded candidate scan (D-158) remain open
and are the whole of what is unanswered; D-212 and D-213 sit above them.

**The fourteenth boundary was taken on 2026-09-13, and the budget asked for it rather than an
argument closing.** That is the first time in fourteen that the number moved first — D-192's own
entry took the file to **119 KB against a 117 KB budget**, and `check:docs --strict` failed rather
than warned. The range was available because the fence had already come down: D-188 recorded that
`/statistics` carries the spending calendar, so **D-179 and D-183 were in the owner's phone captures
after all** and D-184 was freed with them, while **D-180 and D-181 were closed by the owner's
decision** to leave the four schemes unphotographed. So the boundary cost nothing that was still
being argued about — it **completed** `ARCHIVE-D-177-D-186.md` rather than opening a fifteenth file,
putting the five held-back entries back beside the five that left on 2026-09-04 and making that
range contiguous and honest about its own name. **75% afterwards, from 99% before the thirteenth.**
The rule is unchanged and worth restating because this boundary is the exception that tests it: a
boundary sits where an argument ends, and when the budget forces one anyway, the right move is to
take a range whose arguments have *already* ended rather than to cut into one that has not.

**The twelfth boundary moved D-171 … D-176 for 95% → 74%, and it is the first contiguous one in
five.** The eighth, ninth, tenth and eleventh each stepped over an open question or grouped a
stranded id with a later range; this one did not have to, because both open questions sit *below*
D-171. What it moved is one arc — the tenth boundary itself, then the four days in which the
statistics surface got its URL state and its account dimension and reached hosted (D-172 … D-176).
**What bought it was not a question closing but a run of work finishing**: everything in the range
was verified on the deployment and nothing in it is waiting on anything. **D-141 and D-158 are not
stepped over this time** — for the first time since the seventh boundary, the range simply began
above them.

**The thirteenth boundary moved D-177, D-178, D-182, D-185 and D-186 for 99% → 72%, and it is the
first one bought by a measurement rather than an argument or a shipped feature.** The twelfth named
its own fence precisely — five entries, one missing reading, a phone — and then that reading
happened, on 2026-09-04, and immediately produced a defect that had been live since the day headings
shipped (D-187). **A fence expires when the question closes, and a question closes when the code has
stopped asking it**: for the ledger day-heading arc the code has now stopped, because the defect the
reading found is fixed and deployed. **It expired for five of the nine and not the other four**,
which is why this boundary has four holes in a ten-wide range — the widest set of holes any boundary
here has carried, and each one names a surface nobody has rendered at 390px rather than an argument
nobody has settled. **The lesson the twelfth was owed is now on the record**: "one reading frees all
five" was optimistic by four, because a reading is of a *page* and the fence was drawn around a
*budget*.

**The rate has not slowed and that is still the thing to watch**: four boundaries in six days, and
this file went 83% → 95% in a single session on the strength of two entries. D-180 and D-181 are 9.3
KB and 4.2 KB. A log whose entries argue at that length will need a boundary roughly every time two
of them land, so the next one is a question of when rather than whether — and D-137's reversal
(D-180) must stay findable from here while anyone might still read the entry it overturns, which is
a reason to keep it rather than a reason it cannot ever move.

**The size guard measures bytes, not lines, and that correction is the reason this archive exists** (`scripts/check-docs.mjs`). The budget was 1,200 lines and this file passed it at 1,132 while being 332 KB — roughly 80,000 tokens, most of a context window — because the entries grew sideways rather than downward. A guard that exists to stop a log outgrowing a single read has to measure what a read actually costs.

## `GOTCHAS.md` header

**What a date on a `Verify:` line means, and what a backfilled one does not.** An ordinary date is the day the trap was checked against a running system. A clause reading **`Dated <date> from <sha>`** is weaker and deliberately says so: it was recovered on 2026-08-10 from the commit that introduced the code the trap is about, so it marks when the trap became *true* rather than when it was last confirmed *still* true. Neither kind is a promise that the trap holds today — that is what makes the date worth having, since a trap whose date is months behind the code it names is the one to re-read first. A date was never invented for an entry whose evidence could not be found; those stay undated, which is honest and is what `--strict` will keep failing on.

**One hundred and ninety-one traps, and this file is now the index to them rather than the file that holds them** (D-149, 2026-08-25). They were grouped on 2026-08-09 into the sections below — eight then, nine since `app.md` split on 2026-08-27 — added to since, and their bodies moved into `docs/gotchas/` — one file per section — when this file breached its budget a second time. **The split was owed rather than chosen**: D-134 raised the budget once and said the next breach was owed a split along these exact section headings, not a third raise. Neither move changed anything inside a trap; `Last reviewed` above is deliberately unchanged, because reorganising a file is not reviewing what it claims. **The index below still lists every trap in every section**, which is what makes finding one cost a scan of this file and then exactly one open. `pnpm check:docs --strict` fails if the index and the bodies disagree.

