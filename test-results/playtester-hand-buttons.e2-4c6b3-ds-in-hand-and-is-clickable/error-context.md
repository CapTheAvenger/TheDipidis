# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playtester-hand-buttons.e2e.spec.js >> Playtester Hand Buttons >> Play button exists on trainer cards in hand and is clickable
- Location: tests\e2e\playtester-hand-buttons.e2e.spec.js:51:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.goto: Test timeout of 60000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:8000/index.html", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - generic "Open navigation menu" [ref=e8] [cursor=pointer]
          - generic [ref=e12]:
            - heading "Pokémon TCG Hub City League Meta" [level=1] [ref=e13]:
              - generic [ref=e14]: Pokémon TCG Hub
              - generic [ref=e15]: City League Meta
            - paragraph [ref=e16]: Your Portal for Meta Analysis & Deck Building
        - generic [ref=e17]:
          - button "EN" [ref=e18] [cursor=pointer]
          - button "Open battle journal" [ref=e19] [cursor=pointer]:
            - generic [ref=e20]: Journal
          - button "Sign In Sign In" [ref=e22] [cursor=pointer]:
            - img "Sign In" [ref=e23]
            - generic [ref=e24]: Sign In
    - main [ref=e25]:
      - generic [ref=e28]:
        - generic [ref=e29]:
          - heading "City League Development Help for City League Meta" [level=2] [ref=e30]:
            - text: City League Development
            - button "Help for City League Meta" [ref=e31] [cursor=pointer]
          - combobox "Meta format" [ref=e33] [cursor=pointer]:
            - option "Current Meta" [selected]
            - option "Past Meta"
        - generic [ref=e34]:
          - generic [ref=e35]:
            - region "Top Archetypes Hero" [ref=e36]:
              - generic [ref=e37]:
                - heading "Top Archetypes" [level=2] [ref=e38]
                - paragraph [ref=e39]: Combined by main Pokemon, based on current City League deck counts.
              - generic [ref=e40]:
                - generic [ref=e43] [cursor=pointer]:
                  - generic [ref=e44]:
                    - generic [ref=e45]: "#1"
                    - heading "Dragapult" [level=3] [ref=e46]
                  - generic [ref=e47]: 32 variants
                  - generic [ref=e48]:
                    - generic [ref=e49]: 📦 2126 Decks
                    - generic "Lower Rank = Better Performance" [ref=e50]: 🏆 Avg Rank 8.2
                - generic [ref=e53] [cursor=pointer]:
                  - generic [ref=e54]:
                    - generic [ref=e55]: "#2"
                    - heading "Mega Lucario" [level=3] [ref=e56]
                  - generic [ref=e57]: 13 variants
                  - generic [ref=e58]:
                    - generic [ref=e59]: 📦 804 Decks
                    - generic "Lower Rank = Better Performance" [ref=e60]: 🏆 Avg Rank 8.6
                - generic [ref=e63] [cursor=pointer]:
                  - generic [ref=e64]:
                    - generic [ref=e65]: "#3"
                    - heading "Ogerpon" [level=3] [ref=e66]
                  - generic [ref=e67]: 14 variants
                  - generic [ref=e68]:
                    - generic [ref=e69]: 📦 779 Decks
                    - generic "Lower Rank = Better Performance" [ref=e70]: 🏆 Avg Rank 8.0
                - generic [ref=e73] [cursor=pointer]:
                  - generic [ref=e74]:
                    - generic [ref=e75]: "#4"
                    - heading "Alakazam" [level=3] [ref=e76]
                  - generic [ref=e77]: 5 variants
                  - generic [ref=e78]:
                    - generic [ref=e79]: 📦 449 Decks
                    - generic "Lower Rank = Better Performance" [ref=e80]: 🏆 Avg Rank 8.4
                - generic [ref=e83] [cursor=pointer]:
                  - generic [ref=e84]:
                    - generic [ref=e85]: "#5"
                    - heading "Zoroark" [level=3] [ref=e86]
                  - generic [ref=e87]: 14 variants
                  - generic [ref=e88]:
                    - generic [ref=e89]: 📦 435 Decks
                    - generic "Lower Rank = Better Performance" [ref=e90]: 🏆 Avg Rank 8.1
            - generic [ref=e91]:
              - generic [ref=e92]:
                - heading "Tier 1 Meta Definition" [level=3] [ref=e93]:
                  - text: Tier 1
                  - generic [ref=e94]: Meta Definition
                - generic [ref=e95]:
                  - generic [ref=e98] [cursor=pointer]:
                    - generic [ref=e99]: Dragapult Meowth
                    - generic [ref=e100]:
                      - generic "Lower Rank = Better Performance" [ref=e101]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e102]: "(M3: 8.3)"
                        - generic [ref=e103]: ▲
                      - generic [ref=e104]:
                        - text: "📊 Share: 8.0%"
                        - generic [ref=e105]: "(M3: 3.7%)"
                        - generic [ref=e106]: ▲
                  - generic [ref=e109] [cursor=pointer]:
                    - generic [ref=e110]: Mega Lucario Hariyama
                    - generic [ref=e111]:
                      - generic "Lower Rank = Better Performance" [ref=e112]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e113]: "(M3: 8.7)"
                        - generic [ref=e114]: ▲
                      - generic [ref=e115]:
                        - text: "📊 Share: 6.0%"
                        - generic [ref=e116]: "(M3: 9.1%)"
                        - generic [ref=e117]: ▼
                  - generic [ref=e120] [cursor=pointer]:
                    - generic [ref=e121]: Dragapult Dusknoir
                    - generic [ref=e122]:
                      - generic "Lower Rank = Better Performance" [ref=e123]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e124]: "(M3: 8.5)"
                        - generic [ref=e125]: ▲
                      - generic [ref=e126]:
                        - text: "📊 Share: 7.0%"
                        - generic [ref=e127]: "(M3: 9.1%)"
                        - generic [ref=e128]: ▼
              - generic [ref=e129]:
                - heading "Tier 2 Strong Contenders" [level=3] [ref=e130]:
                  - text: Tier 2
                  - generic [ref=e131]: Strong Contenders
                - generic [ref=e132]:
                  - generic [ref=e135] [cursor=pointer]:
                    - generic [ref=e136]: Dragapult
                    - generic [ref=e137]:
                      - generic "Lower Rank = Better Performance" [ref=e138]:
                        - text: "🏆 Rank: 7.0"
                        - generic [ref=e139]: "(M3: 7.7)"
                        - generic [ref=e140]: ▲
                      - generic [ref=e141]:
                        - text: "📊 Share: 2.0%"
                        - generic [ref=e142]: "(M3: 3.3%)"
                        - generic [ref=e143]: ▼
                  - generic [ref=e146] [cursor=pointer]:
                    - generic [ref=e147]: Dragapult Blaziken
                    - generic [ref=e148]:
                      - generic "Lower Rank = Better Performance" [ref=e149]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e150]: "(M3: 8.1)"
                        - generic [ref=e151]: ▲
                      - generic [ref=e152]:
                        - text: "📊 Share: 4.0%"
                        - generic [ref=e153]: "(M3: 3.8%)"
                        - generic [ref=e154]: ▲
                  - generic [ref=e157] [cursor=pointer]:
                    - generic [ref=e158]: Grimmsnarl Munkidori
                    - generic [ref=e159]:
                      - generic "Lower Rank = Better Performance" [ref=e160]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e161]: "(M3: 8.0)"
                        - generic [ref=e162]: ▼
                      - generic [ref=e163]:
                        - text: "📊 Share: 3.0%"
                        - generic [ref=e164]: "(M3: 3.3%)"
                        - generic [ref=e165]: ▼
                  - generic [ref=e168] [cursor=pointer]:
                    - generic [ref=e169]: Zoroark Darmanitan
                    - generic [ref=e170]:
                      - generic "Lower Rank = Better Performance" [ref=e171]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e172]: "(M3: 8.0)"
                        - generic [ref=e173]: ▲
                      - generic [ref=e174]:
                        - text: "📊 Share: 3.0%"
                        - generic [ref=e175]: "(M3: 3.1%)"
                        - generic [ref=e176]: ▼
                  - generic [ref=e179] [cursor=pointer]:
                    - generic [ref=e180]: Spidops Mewtwo
                    - generic [ref=e181]:
                      - generic "Lower Rank = Better Performance" [ref=e182]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e183]: "(M3: 8.6)"
                        - generic [ref=e184]: ▲
                      - generic [ref=e185]:
                        - text: "📊 Share: 3.0%"
                        - generic [ref=e186]: "(M3: 3.2%)"
                        - generic [ref=e187]: ▼
                  - generic [ref=e190] [cursor=pointer]:
                    - generic [ref=e191]: Alakazam Dudunsparce
                    - generic [ref=e192]:
                      - generic "Lower Rank = Better Performance" [ref=e193]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e194]: "(M3: 8.1)"
                        - generic [ref=e195]: ▲
                      - generic [ref=e196]:
                        - text: "📊 Share: 5.0%"
                        - generic [ref=e197]: "(M3: 5.0%)"
                        - generic [ref=e198]: ▼
                  - generic [ref=e201] [cursor=pointer]:
                    - generic [ref=e202]: Garchomp Roserade
                    - generic [ref=e203]:
                      - generic "Lower Rank = Better Performance" [ref=e204]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e205]: "(M3: 8.6)"
                        - generic [ref=e206]: ▲
                      - generic [ref=e207]:
                        - text: "📊 Share: 3.0%"
                        - generic [ref=e208]: "(M3: 4.3%)"
                        - generic [ref=e209]: ▼
              - generic [ref=e210]:
                - heading "Tier 3 Viable Options" [level=3] [ref=e211]:
                  - text: Tier 3
                  - generic [ref=e212]: Viable Options
                - generic [ref=e213]:
                  - generic [ref=e216] [cursor=pointer]:
                    - generic [ref=e217]: Ogerpon Arboliva
                    - generic [ref=e218]:
                      - generic "Lower Rank = Better Performance" [ref=e219]:
                        - text: "🏆 Rank: 7.0"
                        - generic [ref=e220]: "(M3: 6.5)"
                        - generic [ref=e221]: ▼
                      - generic [ref=e222]:
                        - text: "📊 Share: 2.0%"
                        - generic [ref=e223]: "(M3: 1.2%)"
                        - generic [ref=e224]: ▲
                  - generic [ref=e227] [cursor=pointer]:
                    - generic [ref=e228]: Ogerpon Raging-Bolt
                    - generic [ref=e229]:
                      - generic "Lower Rank = Better Performance" [ref=e230]:
                        - text: "🏆 Rank: 7.0"
                        - generic [ref=e231]: "(M3: 8.1)"
                        - generic [ref=e232]: ▲
                      - generic [ref=e233]:
                        - text: "📊 Share: 2.0%"
                        - generic [ref=e234]: "(M3: 1.2%)"
                        - generic [ref=e235]: ▲
                  - generic [ref=e238] [cursor=pointer]:
                    - generic [ref=e239]: Zoroark
                    - generic [ref=e240]:
                      - generic "Lower Rank = Better Performance" [ref=e241]:
                        - text: "🏆 Rank: 7.0"
                        - generic [ref=e242]: "(M3: 8.5)"
                        - generic [ref=e243]: ▲
                      - generic [ref=e244]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e245]: "(M3: 0.8%)"
                        - generic [ref=e246]: ▲
                  - generic [ref=e249] [cursor=pointer]:
                    - generic [ref=e250]: Honchkrow Porygon2
                    - generic [ref=e251]:
                      - generic "Lower Rank = Better Performance" [ref=e252]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e253]: "(M3: 7.8)"
                        - generic [ref=e254]: ▼
                      - generic [ref=e255]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e256]: "(M3: 1.0%)"
                        - generic [ref=e257]: ▼
                  - generic [ref=e260] [cursor=pointer]:
                    - generic [ref=e261]: Crustle Munkidori
                    - generic [ref=e262]:
                      - generic "Lower Rank = Better Performance" [ref=e263]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e264]: "(M3: 9.0)"
                        - generic [ref=e265]: ▲
                      - generic [ref=e266]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e267]: "(M3: 0.8%)"
                        - generic [ref=e268]: ▲
                  - generic [ref=e271] [cursor=pointer]:
                    - generic [ref=e272]: Ogerpon Mega Kangaskhan
                    - generic [ref=e273]:
                      - generic "Lower Rank = Better Performance" [ref=e274]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e275]: "(M3: 8.9)"
                        - generic [ref=e276]: ▲
                      - generic [ref=e277]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e278]: "(M3: 0.5%)"
                        - generic [ref=e279]: ▲
                  - generic [ref=e282] [cursor=pointer]:
                    - generic [ref=e283]: Barbaracle Okidogi
                    - generic [ref=e284]:
                      - generic "Lower Rank = Better Performance" [ref=e285]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e286]: "(M3: 8.7)"
                        - generic [ref=e287]: ▲
                      - generic [ref=e288]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e289]: "(M3: 1.7%)"
                        - generic [ref=e290]: ▼
                  - generic [ref=e293] [cursor=pointer]:
                    - generic [ref=e294]: Grimmsnarl Froslass
                    - generic [ref=e295]:
                      - generic "Lower Rank = Better Performance" [ref=e296]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e297]: "(M3: 8.1)"
                        - generic [ref=e298]: ▲
                      - generic [ref=e299]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e300]: "(M3: 2.8%)"
                        - generic [ref=e301]: ▼
                  - generic [ref=e304] [cursor=pointer]:
                    - generic [ref=e305]: Mega Venusaur Ogerpon
                    - generic [ref=e306]:
                      - generic "Lower Rank = Better Performance" [ref=e307]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e308]: "(M3: 9.1)"
                        - generic [ref=e309]: ▲
                      - generic [ref=e310]:
                        - text: "📊 Share: 1.0%"
                        - generic [ref=e311]: "(M3: 2.1%)"
                        - generic [ref=e312]: ▼
                  - generic [ref=e315] [cursor=pointer]:
                    - generic [ref=e316]: Mega Lucario Solrock
                    - generic [ref=e317]:
                      - generic "Lower Rank = Better Performance" [ref=e318]:
                        - text: "🏆 Rank: 8.0"
                        - generic [ref=e319]: "(M3: 8.5)"
                        - generic [ref=e320]: ▲
                      - generic [ref=e321]:
                        - text: "📊 Share: 2.0%"
                        - generic [ref=e322]: "(M3: 2.9%)"
                        - generic [ref=e323]: ▼
              - group [ref=e325]:
                - generic "Rogue / Trending Emerging Archetypes 355 Decks ▼" [ref=e326] [cursor=pointer]:
                  - heading "Rogue / Trending Emerging Archetypes" [level=3] [ref=e327]
                  - generic [ref=e328]: 355 Decks
                  - text: ▼
          - generic [ref=e329]:
            - generic [ref=e330]:
              - heading "Archetype Overview" [level=3] [ref=e331]
              - generic [ref=e332]: "375"
              - generic [ref=e333]:
                - strong [ref=e334]: "Top 3 by Count:"
                - text: "Dragapult Meowth: 686x"
                - text: "Dragapult Dusknoir: 587x"
                - text: "Mega Lucario Hariyama: 570x"
                - strong [ref=e335]: "Top 3 by Average Placement:"
                - text: "Noctowl Flareon: 7,25"
                - text: "Ogerpon Arboliva: 7,41"
                - text: "Dipplin Thwackey: 7,72"
            - generic [ref=e336]:
              - heading "Top 10 Changes" [level=3] [ref=e337]
              - generic [ref=e338]: No changes in top 10
            - generic [ref=e339]:
              - heading "Data Source" [level=3] [ref=e340]
              - generic [ref=e341]:
                - strong [ref=e342]: "Period:"
                - text: 07 Feb 26 - 11 Apr 26
                - strong [ref=e343]: "Tournaments:"
                - text: "535"
          - generic [ref=e344]:
            - generic [ref=e345]:
              - heading "Performance Improvers (Better Average Placement)" [level=2] [ref=e346]
              - table [ref=e347]:
                - rowgroup [ref=e348]:
                  - row "Archetype Count Average Placement" [ref=e349]:
                    - columnheader "Archetype" [ref=e350]
                    - columnheader "Count" [ref=e351]
                    - columnheader "Average Placement" [ref=e352]
                - rowgroup [ref=e353]:
                  - row "Mega Meganium Ogerpon 88 (+6) 8,45 (-0.25)" [ref=e354] [cursor=pointer]:
                    - cell "Mega Meganium Ogerpon" [ref=e355]:
                      - link "Mega Meganium Ogerpon" [ref=e356]:
                        - /url: javascript:void(0)
                    - cell "88 (+6)" [ref=e357]
                    - cell "8,45 (-0.25)" [ref=e358]
                  - row "Ogerpon Arboliva 184 (+15) 7,41 (-0.15)" [ref=e359] [cursor=pointer]:
                    - cell "Ogerpon Arboliva" [ref=e360]:
                      - link "Ogerpon Arboliva" [ref=e361]:
                        - /url: javascript:void(0)
                    - cell "184 (+15)" [ref=e362]
                    - cell "7,41 (-0.15)" [ref=e363]
                  - row "Barbaracle Okidogi 150 (+12) 8,61 (-0.13)" [ref=e364] [cursor=pointer]:
                    - cell "Barbaracle Okidogi" [ref=e365]:
                      - link "Barbaracle Okidogi" [ref=e366]:
                        - /url: javascript:void(0)
                    - cell "150 (+12)" [ref=e367]
                    - cell "8,61 (-0.13)" [ref=e368]
                  - row "Honchkrow Porygon2 100 (+4) 8,04 (-0.11)" [ref=e369] [cursor=pointer]:
                    - cell "Honchkrow Porygon2" [ref=e370]:
                      - link "Honchkrow Porygon2" [ref=e371]:
                        - /url: javascript:void(0)
                    - cell "100 (+4)" [ref=e372]
                    - cell "8,04 (-0.11)" [ref=e373]
                  - row "Mega Lucario Hariyama 570 (+22) 8,59 (-0.06)" [ref=e374] [cursor=pointer]:
                    - cell "Mega Lucario Hariyama" [ref=e375]:
                      - link "Mega Lucario Hariyama" [ref=e376]:
                        - /url: javascript:void(0)
                    - cell "570 (+22)" [ref=e377]
                    - cell "8,59 (-0.06)" [ref=e378]
                  - row "Dragapult 224 (+5) 7,77 (-0.06)" [ref=e379] [cursor=pointer]:
                    - cell "Dragapult" [ref=e380]:
                      - link "Dragapult" [ref=e381]:
                        - /url: javascript:void(0)
                    - cell "224 (+5)" [ref=e382]
                    - cell "7,77 (-0.06)" [ref=e383]
                  - row "Zoroark 94 (+12) 7,85 (-0.06)" [ref=e384] [cursor=pointer]:
                    - cell "Zoroark" [ref=e385]:
                      - link "Zoroark" [ref=e386]:
                        - /url: javascript:void(0)
                    - cell "94 (+12)" [ref=e387]
                    - cell "7,85 (-0.06)" [ref=e388]
                  - row "Mega Venusaur Ogerpon 125 (+3) 8,87 (-0.04)" [ref=e389] [cursor=pointer]:
                    - cell "Mega Venusaur Ogerpon" [ref=e390]:
                      - link "Mega Venusaur Ogerpon" [ref=e391]:
                        - /url: javascript:void(0)
                    - cell "125 (+3)" [ref=e392]
                    - cell "8,87 (-0.04)" [ref=e393]
                  - row "Ogerpon Noctowl 86 (+3) 8,62 (-0.02)" [ref=e394] [cursor=pointer]:
                    - cell "Ogerpon Noctowl" [ref=e395]:
                      - link "Ogerpon Noctowl" [ref=e396]:
                        - /url: javascript:void(0)
                    - cell "86 (+3)" [ref=e397]
                    - cell "8,62 (-0.02)" [ref=e398]
            - generic [ref=e399]:
              - heading "Performance Decliners (Worse Average Placement)" [level=2] [ref=e400]
              - table [ref=e401]:
                - rowgroup [ref=e402]:
                  - row "Archetype Count Average Placement" [ref=e403]:
                    - columnheader "Archetype" [ref=e404]
                    - columnheader "Count" [ref=e405]
                    - columnheader "Average Placement" [ref=e406]
                - rowgroup [ref=e407]:
                  - row "Greninja Dusknoir 79 (+7) 8,28 (+0.10)" [ref=e408] [cursor=pointer]:
                    - cell "Greninja Dusknoir" [ref=e409]:
                      - link "Greninja Dusknoir" [ref=e410]:
                        - /url: javascript:void(0)
                    - cell "79 (+7)" [ref=e411]
                    - cell "8,28 (+0.10)" [ref=e412]
                  - row "Dragapult Blaziken 373 (+31) 8,02 (+0.09)" [ref=e413] [cursor=pointer]:
                    - cell "Dragapult Blaziken" [ref=e414]:
                      - link "Dragapult Blaziken" [ref=e415]:
                        - /url: javascript:void(0)
                    - cell "373 (+31)" [ref=e416]
                    - cell "8,02 (+0.09)" [ref=e417]
                  - row "Crustle Munkidori 118 (+6) 8,16 (+0.09)" [ref=e418] [cursor=pointer]:
                    - cell "Crustle Munkidori" [ref=e419]:
                      - link "Crustle Munkidori" [ref=e420]:
                        - /url: javascript:void(0)
                    - cell "118 (+6)" [ref=e421]
                    - cell "8,16 (+0.09)" [ref=e422]
                  - row "Noctowl Flareon 72 (+4) 7,25 (+0.09)" [ref=e423] [cursor=pointer]:
                    - cell "Noctowl Flareon" [ref=e424]:
                      - link "Noctowl Flareon" [ref=e425]:
                        - /url: javascript:void(0)
                    - cell "72 (+4)" [ref=e426]
                    - cell "7,25 (+0.09)" [ref=e427]
                  - row "Alakazam Dudunsparce 426 (+22) 8,25 (+0.07)" [ref=e428] [cursor=pointer]:
                    - cell "Alakazam Dudunsparce" [ref=e429]:
                      - link "Alakazam Dudunsparce" [ref=e430]:
                        - /url: javascript:void(0)
                    - cell "426 (+22)" [ref=e431]
                    - cell "8,25 (+0.07)" [ref=e432]
                  - row "Ogerpon Raging-Bolt 178 (+11) 7,79 (+0.07)" [ref=e433] [cursor=pointer]:
                    - cell "Ogerpon Raging-Bolt" [ref=e434]:
                      - link "Ogerpon Raging-Bolt" [ref=e435]:
                        - /url: javascript:void(0)
                    - cell "178 (+11)" [ref=e436]
                    - cell "7,79 (+0.07)" [ref=e437]
                  - row "Mega Starmie Mega Froslass 78 (+1) 8,82 (+0.05)" [ref=e438] [cursor=pointer]:
                    - cell "Mega Starmie Mega Froslass" [ref=e439]:
                      - link "Mega Starmie Mega Froslass" [ref=e440]:
                        - /url: javascript:void(0)
                    - cell "78 (+1)" [ref=e441]
                    - cell "8,82 (+0.05)" [ref=e442]
                  - row "Grimmsnarl Munkidori 287 (+14) 8,05 (+0.04)" [ref=e443] [cursor=pointer]:
                    - cell "Grimmsnarl Munkidori" [ref=e444]:
                      - link "Grimmsnarl Munkidori" [ref=e445]:
                        - /url: javascript:void(0)
                    - cell "287 (+14)" [ref=e446]
                    - cell "8,05 (+0.04)" [ref=e447]
                  - row "Ogerpon Mega Kangaskhan 102 (+7) 8,6 (+0.04)" [ref=e448] [cursor=pointer]:
                    - cell "Ogerpon Mega Kangaskhan" [ref=e449]:
                      - link "Ogerpon Mega Kangaskhan" [ref=e450]:
                        - /url: javascript:void(0)
                    - cell "102 (+7)" [ref=e451]
                    - cell "8,6 (+0.04)" [ref=e452]
                  - row "Honchkrow Porygon-Z 89 (+1) 8,63 (+0.04)" [ref=e453] [cursor=pointer]:
                    - cell "Honchkrow Porygon-Z" [ref=e454]:
                      - link "Honchkrow Porygon-Z" [ref=e455]:
                        - /url: javascript:void(0)
                    - cell "89 (+1)" [ref=e456]
                    - cell "8,63 (+0.04)" [ref=e457]
          - generic [ref=e458]:
            - generic [ref=e459]:
              - heading "Full Comparison Table (Top 30)" [level=2] [ref=e460]
              - textbox "Search City League table" [ref=e462]:
                - /placeholder: "Search e.g.: draga, luca"
              - table [ref=e464]:
                - rowgroup [ref=e465]:
                  - row "Archetype Count Average Placement" [ref=e466]:
                    - columnheader "Archetype" [ref=e467]
                    - columnheader "Count" [ref=e468]
                    - columnheader "Average Placement" [ref=e469]
                - rowgroup [ref=e470]:
                  - row "Dragapult Meowth 686 (+56) 8,14 (+0.01)" [ref=e471] [cursor=pointer]:
                    - cell "Dragapult Meowth" [ref=e472]:
                      - link "Dragapult Meowth" [ref=e473]:
                        - /url: javascript:void(0)
                    - cell "686 (+56)" [ref=e474]
                    - cell "8,14 (+0.01)" [ref=e475]
                  - row "Dragapult Dusknoir 587 (+14) 8,61 (0.00)" [ref=e476] [cursor=pointer]:
                    - cell "Dragapult Dusknoir" [ref=e477]:
                      - link "Dragapult Dusknoir" [ref=e478]:
                        - /url: javascript:void(0)
                    - cell "587 (+14)" [ref=e479]
                    - cell "8,61 (0.00)" [ref=e480]
                  - row "Mega Lucario Hariyama 570 (+22) 8,59 (-0.06)" [ref=e481] [cursor=pointer]:
                    - cell "Mega Lucario Hariyama" [ref=e482]:
                      - link "Mega Lucario Hariyama" [ref=e483]:
                        - /url: javascript:void(0)
                    - cell "570 (+22)" [ref=e484]
                    - cell "8,59 (-0.06)" [ref=e485]
                  - row "Alakazam Dudunsparce 426 (+22) 8,25 (+0.07)" [ref=e486] [cursor=pointer]:
                    - cell "Alakazam Dudunsparce" [ref=e487]:
                      - link "Alakazam Dudunsparce" [ref=e488]:
                        - /url: javascript:void(0)
                    - cell "426 (+22)" [ref=e489]
                    - cell "8,25 (+0.07)" [ref=e490]
                  - row "Dragapult Blaziken 373 (+31) 8,02 (+0.09)" [ref=e491] [cursor=pointer]:
                    - cell "Dragapult Blaziken" [ref=e492]:
                      - link "Dragapult Blaziken" [ref=e493]:
                        - /url: javascript:void(0)
                    - cell "373 (+31)" [ref=e494]
                    - cell "8,02 (+0.09)" [ref=e495]
                  - row "Garchomp Roserade 332 (+32) 8,48 (+0.02)" [ref=e496] [cursor=pointer]:
                    - cell "Garchomp Roserade" [ref=e497]:
                      - link "Garchomp Roserade" [ref=e498]:
                        - /url: javascript:void(0)
                    - cell "332 (+32)" [ref=e499]
                    - cell "8,48 (+0.02)" [ref=e500]
                  - row "Zoroark Darmanitan 288 (+7) 8,07 (+0.01)" [ref=e501] [cursor=pointer]:
                    - cell "Zoroark Darmanitan" [ref=e502]:
                      - link "Zoroark Darmanitan" [ref=e503]:
                        - /url: javascript:void(0)
                    - cell "288 (+7)" [ref=e504]
                    - cell "8,07 (+0.01)" [ref=e505]
                  - row "Spidops Mewtwo 287 (+25) 8,21 (+0.01)" [ref=e506] [cursor=pointer]:
                    - cell "Spidops Mewtwo" [ref=e507]:
                      - link "Spidops Mewtwo" [ref=e508]:
                        - /url: javascript:void(0)
                    - cell "287 (+25)" [ref=e509]
                    - cell "8,21 (+0.01)" [ref=e510]
                  - row "Grimmsnarl Munkidori 287 (+14) 8,05 (+0.04)" [ref=e511] [cursor=pointer]:
                    - cell "Grimmsnarl Munkidori" [ref=e512]:
                      - link "Grimmsnarl Munkidori" [ref=e513]:
                        - /url: javascript:void(0)
                    - cell "287 (+14)" [ref=e514]
                    - cell "8,05 (+0.04)" [ref=e515]
                  - row "Dragapult 224 (+5) 7,77 (-0.06)" [ref=e516] [cursor=pointer]:
                    - cell "Dragapult" [ref=e517]:
                      - link "Dragapult" [ref=e518]:
                        - /url: javascript:void(0)
                    - cell "224 (+5)" [ref=e519]
                    - cell "7,77 (-0.06)" [ref=e520]
                  - row "Ogerpon Arboliva 184 (+15) 7,41 (-0.15)" [ref=e521] [cursor=pointer]:
                    - cell "Ogerpon Arboliva" [ref=e522]:
                      - link "Ogerpon Arboliva" [ref=e523]:
                        - /url: javascript:void(0)
                    - cell "184 (+15)" [ref=e524]
                    - cell "7,41 (-0.15)" [ref=e525]
                  - row "Mega Lucario Solrock 182 (+2) 8,9 (0.00)" [ref=e526] [cursor=pointer]:
                    - cell "Mega Lucario Solrock" [ref=e527]:
                      - link "Mega Lucario Solrock" [ref=e528]:
                        - /url: javascript:void(0)
                    - cell "182 (+2)" [ref=e529]
                    - cell "8,9 (0.00)" [ref=e530]
                  - row "Ogerpon Raging-Bolt 178 (+11) 7,79 (+0.07)" [ref=e531] [cursor=pointer]:
                    - cell "Ogerpon Raging-Bolt" [ref=e532]:
                      - link "Ogerpon Raging-Bolt" [ref=e533]:
                        - /url: javascript:void(0)
                    - cell "178 (+11)" [ref=e534]
                    - cell "7,79 (+0.07)" [ref=e535]
                  - row "Barbaracle Okidogi 150 (+12) 8,61 (-0.13)" [ref=e536] [cursor=pointer]:
                    - cell "Barbaracle Okidogi" [ref=e537]:
                      - link "Barbaracle Okidogi" [ref=e538]:
                        - /url: javascript:void(0)
                    - cell "150 (+12)" [ref=e539]
                    - cell "8,61 (-0.13)" [ref=e540]
                  - row "Mega Venusaur Ogerpon 125 (+3) 8,87 (-0.04)" [ref=e541] [cursor=pointer]:
                    - cell "Mega Venusaur Ogerpon" [ref=e542]:
                      - link "Mega Venusaur Ogerpon" [ref=e543]:
                        - /url: javascript:void(0)
                    - cell "125 (+3)" [ref=e544]
                    - cell "8,87 (-0.04)" [ref=e545]
                  - row "Crustle Munkidori 118 (+6) 8,16 (+0.09)" [ref=e546] [cursor=pointer]:
                    - cell "Crustle Munkidori" [ref=e547]:
                      - link "Crustle Munkidori" [ref=e548]:
                        - /url: javascript:void(0)
                    - cell "118 (+6)" [ref=e549]
                    - cell "8,16 (+0.09)" [ref=e550]
                  - row "Grimmsnarl Froslass 114 (+2) 8,68 (0.00)" [ref=e551] [cursor=pointer]:
                    - cell "Grimmsnarl Froslass" [ref=e552]:
                      - link "Grimmsnarl Froslass" [ref=e553]:
                        - /url: javascript:void(0)
                    - cell "114 (+2)" [ref=e554]
                    - cell "8,68 (0.00)" [ref=e555]
                  - row "Ogerpon Mega Kangaskhan 102 (+7) 8,6 (+0.04)" [ref=e556] [cursor=pointer]:
                    - cell "Ogerpon Mega Kangaskhan" [ref=e557]:
                      - link "Ogerpon Mega Kangaskhan" [ref=e558]:
                        - /url: javascript:void(0)
                    - cell "102 (+7)" [ref=e559]
                    - cell "8,6 (+0.04)" [ref=e560]
                  - row "Honchkrow Porygon2 100 (+4) 8,04 (-0.11)" [ref=e561] [cursor=pointer]:
                    - cell "Honchkrow Porygon2" [ref=e562]:
                      - link "Honchkrow Porygon2" [ref=e563]:
                        - /url: javascript:void(0)
                    - cell "100 (+4)" [ref=e564]
                    - cell "8,04 (-0.11)" [ref=e565]
                  - row "Zoroark 94 (+12) 7,85 (-0.06)" [ref=e566] [cursor=pointer]:
                    - cell "Zoroark" [ref=e567]:
                      - link "Zoroark" [ref=e568]:
                        - /url: javascript:void(0)
                    - cell "94 (+12)" [ref=e569]
                    - cell "7,85 (-0.06)" [ref=e570]
                  - row "Honchkrow Porygon-Z 89 (+1) 8,63 (+0.04)" [ref=e571] [cursor=pointer]:
                    - cell "Honchkrow Porygon-Z" [ref=e572]:
                      - link "Honchkrow Porygon-Z" [ref=e573]:
                        - /url: javascript:void(0)
                    - cell "89 (+1)" [ref=e574]
                    - cell "8,63 (+0.04)" [ref=e575]
                  - row "Dusknoir Mega Diancie 89 (0) 9,66 (0.00)" [ref=e576] [cursor=pointer]:
                    - cell "Dusknoir Mega Diancie" [ref=e577]:
                      - link "Dusknoir Mega Diancie" [ref=e578]:
                        - /url: javascript:void(0)
                    - cell "89 (0)" [ref=e579]
                    - cell "9,66 (0.00)" [ref=e580]
                  - row "Mega Meganium Ogerpon 88 (+6) 8,45 (-0.25)" [ref=e581] [cursor=pointer]:
                    - cell "Mega Meganium Ogerpon" [ref=e582]:
                      - link "Mega Meganium Ogerpon" [ref=e583]:
                        - /url: javascript:void(0)
                    - cell "88 (+6)" [ref=e584]
                    - cell "8,45 (-0.25)" [ref=e585]
                  - row "Ogerpon Noctowl 86 (+3) 8,62 (-0.02)" [ref=e586] [cursor=pointer]:
                    - cell "Ogerpon Noctowl" [ref=e587]:
                      - link "Ogerpon Noctowl" [ref=e588]:
                        - /url: javascript:void(0)
                    - cell "86 (+3)" [ref=e589]
                    - cell "8,62 (-0.02)" [ref=e590]
                  - row "Greninja Dusknoir 79 (+7) 8,28 (+0.10)" [ref=e591] [cursor=pointer]:
                    - cell "Greninja Dusknoir" [ref=e592]:
                      - link "Greninja Dusknoir" [ref=e593]:
                        - /url: javascript:void(0)
                    - cell "79 (+7)" [ref=e594]
                    - cell "8,28 (+0.10)" [ref=e595]
                  - row "Mega Starmie Mega Froslass 78 (+1) 8,82 (+0.05)" [ref=e596] [cursor=pointer]:
                    - cell "Mega Starmie Mega Froslass" [ref=e597]:
                      - link "Mega Starmie Mega Froslass" [ref=e598]:
                        - /url: javascript:void(0)
                    - cell "78 (+1)" [ref=e599]
                    - cell "8,82 (+0.05)" [ref=e600]
                  - row "Noctowl Flareon 72 (+4) 7,25 (+0.09)" [ref=e601] [cursor=pointer]:
                    - cell "Noctowl Flareon" [ref=e602]:
                      - link "Noctowl Flareon" [ref=e603]:
                        - /url: javascript:void(0)
                    - cell "72 (+4)" [ref=e604]
                    - cell "7,25 (+0.09)" [ref=e605]
                  - row "Dipplin Thwackey 71 (+10) 7,72 (+0.01)" [ref=e606] [cursor=pointer]:
                    - cell "Dipplin Thwackey" [ref=e607]:
                      - link "Dipplin Thwackey" [ref=e608]:
                        - /url: javascript:void(0)
                    - cell "71 (+10)" [ref=e609]
                    - cell "7,72 (+0.01)" [ref=e610]
                  - row "Clefairy Ogerpon 68 (+1) 8,1 (+0.09)" [ref=e611] [cursor=pointer]:
                    - cell "Clefairy Ogerpon" [ref=e612]:
                      - link "Clefairy Ogerpon" [ref=e613]:
                        - /url: javascript:void(0)
                    - cell "68 (+1)" [ref=e614]
                    - cell "8,1 (+0.09)" [ref=e615]
                  - row "Ceruledge 65 (+1) 9,52 (+0.09)" [ref=e616] [cursor=pointer]:
                    - cell "Ceruledge" [ref=e617]:
                      - link "Ceruledge" [ref=e618]:
                        - /url: javascript:void(0)
                    - cell "65 (+1)" [ref=e619]
                    - cell "9,52 (+0.09)" [ref=e620]
            - generic [ref=e621]:
              - heading "Archetype Combined (Top 20)" [level=2] [ref=e622]
              - generic [ref=e623]: Combined numbers of all variants of a main Pokémon (e.g. all "dragapult *" decks)
              - table [ref=e625]:
                - rowgroup [ref=e626]:
                  - row "Main Pokémon Variants Count Average Placement" [ref=e627]:
                    - columnheader "Main Pokémon" [ref=e628]
                    - columnheader "Variants" [ref=e629]
                    - columnheader "Count" [ref=e630]
                    - columnheader "Average Placement" [ref=e631]
                - rowgroup [ref=e632]:
                  - row "Dragapult 32 2126 (+144) 8.24 (+0.01)" [ref=e633] [cursor=pointer]:
                    - cell "Dragapult" [ref=e634]
                    - cell "32" [ref=e635]
                    - cell "2126 (+144)" [ref=e636]
                    - cell "8.24 (+0.01)" [ref=e637]
                  - row "Mega lucario 13 804 (+28) 8.64 (-0.04)" [ref=e638] [cursor=pointer]:
                    - cell "Mega lucario" [ref=e639]
                    - cell "13" [ref=e640]
                    - cell "804 (+28)" [ref=e641]
                    - cell "8.64 (-0.04)" [ref=e642]
                  - row "Ogerpon 14 779 (+49) 7.96 (0.00)" [ref=e643] [cursor=pointer]:
                    - cell "Ogerpon" [ref=e644]
                    - cell "14" [ref=e645]
                    - cell "779 (+49)" [ref=e646]
                    - cell "7.96 (0.00)" [ref=e647]
                  - row "Alakazam 5 449 (+25) 8.36 (+0.09)" [ref=e648] [cursor=pointer]:
                    - cell "Alakazam" [ref=e649]
                    - cell "5" [ref=e650]
                    - cell "449 (+25)" [ref=e651]
                    - cell "8.36 (+0.09)" [ref=e652]
                  - row "Zoroark 14 435 (+24) 8.07 (+0.04)" [ref=e653] [cursor=pointer]:
                    - cell "Zoroark" [ref=e654]
                    - cell "14" [ref=e655]
                    - cell "435 (+24)" [ref=e656]
                    - cell "8.07 (+0.04)" [ref=e657]
                  - row "Grimmsnarl 7 422 (+16) 8.23 (+0.02)" [ref=e658] [cursor=pointer]:
                    - cell "Grimmsnarl" [ref=e659]
                    - cell "7" [ref=e660]
                    - cell "422 (+16)" [ref=e661]
                    - cell "8.23 (+0.02)" [ref=e662]
                  - row "Garchomp 3 335 (+32) 8.51 (+0.02)" [ref=e663] [cursor=pointer]:
                    - cell "Garchomp" [ref=e664]
                    - cell "3" [ref=e665]
                    - cell "335 (+32)" [ref=e666]
                    - cell "8.51 (+0.02)" [ref=e667]
                  - row "Spidops 3 292 (+25) 8.23 (0.00)" [ref=e668] [cursor=pointer]:
                    - cell "Spidops" [ref=e669]
                    - cell "3" [ref=e670]
                    - cell "292 (+25)" [ref=e671]
                    - cell "8.23 (0.00)" [ref=e672]
                  - row "Honchkrow 5 194 (+5) 8.31 (-0.04)" [ref=e673] [cursor=pointer]:
                    - cell "Honchkrow" [ref=e674]
                    - cell "5" [ref=e675]
                    - cell "194 (+5)" [ref=e676]
                    - cell "8.31 (-0.04)" [ref=e677]
                  - row "Barbaracle 3 158 (+12) 8.59 (-0.11)" [ref=e678] [cursor=pointer]:
                    - cell "Barbaracle" [ref=e679]
                    - cell "3" [ref=e680]
                    - cell "158 (+12)" [ref=e681]
                    - cell "8.59 (-0.11)" [ref=e682]
                  - row "Metagross 10 147 (+15) 8.84 (-0.12)" [ref=e683] [cursor=pointer]:
                    - cell "Metagross" [ref=e684]
                    - cell "10" [ref=e685]
                    - cell "147 (+15)" [ref=e686]
                    - cell "8.84 (-0.12)" [ref=e687]
                  - row "Noctowl 8 141 (+7) 8.17 (+0.04)" [ref=e688] [cursor=pointer]:
                    - cell "Noctowl" [ref=e689]
                    - cell "8" [ref=e690]
                    - cell "141 (+7)" [ref=e691]
                    - cell "8.17 (+0.04)" [ref=e692]
                  - row "Mega greninja 12 137 (+27) 9.42 (+0.07)" [ref=e693] [cursor=pointer]:
                    - cell "Mega greninja" [ref=e694]
                    - cell "12" [ref=e695]
                    - cell "137 (+27)" [ref=e696]
                    - cell "9.42 (+0.07)" [ref=e697]
                  - row "Mega venusaur 3 129 (+3) 8.87 (-0.04)" [ref=e698] [cursor=pointer]:
                    - cell "Mega venusaur" [ref=e699]
                    - cell "3" [ref=e700]
                    - cell "129 (+3)" [ref=e701]
                    - cell "8.87 (-0.04)" [ref=e702]
                  - row "Crustle 5 123 (+6) 8.18 (+0.09)" [ref=e703] [cursor=pointer]:
                    - cell "Crustle" [ref=e704]
                    - cell "5" [ref=e705]
                    - cell "123 (+6)" [ref=e706]
                    - cell "8.18 (+0.09)" [ref=e707]
                  - row "Mega meganium 3 122 (+7) 8.37 (-0.21)" [ref=e708] [cursor=pointer]:
                    - cell "Mega meganium" [ref=e709]
                    - cell "3" [ref=e710]
                    - cell "122 (+7)" [ref=e711]
                    - cell "8.37 (-0.21)" [ref=e712]
                  - row "Mega kangaskhan 11 115 (+7) 8.36 (+0.06)" [ref=e713] [cursor=pointer]:
                    - cell "Mega kangaskhan" [ref=e714]
                    - cell "11" [ref=e715]
                    - cell "115 (+7)" [ref=e716]
                    - cell "8.36 (+0.06)" [ref=e717]
                  - row "Dusknoir 7 112 (+1) 9.53 (-0.04)" [ref=e718] [cursor=pointer]:
                    - cell "Dusknoir" [ref=e719]
                    - cell "7" [ref=e720]
                    - cell "112 (+1)" [ref=e721]
                    - cell "9.53 (-0.04)" [ref=e722]
                  - row "Greninja 5 108 (+8) 8.49 (0.00)" [ref=e723] [cursor=pointer]:
                    - cell "Greninja" [ref=e724]
                    - cell "5" [ref=e725]
                    - cell "108 (+8)" [ref=e726]
                    - cell "8.49 (0.00)" [ref=e727]
                  - row "Mega starmie 11 104 (+3) 9.16 (+0.14)" [ref=e728] [cursor=pointer]:
                    - cell "Mega starmie" [ref=e729]
                    - cell "11" [ref=e730]
                    - cell "104 (+3)" [ref=e731]
                    - cell "9.16 (+0.14)" [ref=e732]
          - generic [ref=e733]:
            - generic [ref=e734]: "📅 Generated: 14.04.2026, 12:04:17"
            - generic [ref=e735]: "📋 Total Archetypes Tracked: 375"
        - group [ref=e737]:
          - generic "Meta Share Chart – Top Archetypes Toggle" [ref=e738] [cursor=pointer]:
            - text: Meta Share Chart – Top Archetypes
            - generic [ref=e739]: Toggle
    - contentinfo [ref=e745]:
      - paragraph [ref=e746]: "Last Update: 14.4.2026"
  - text: Close Close Close Close Close Close Close Close Close × ×
  - generic [ref=e747]:
    - generic [ref=e748]:
      - generic [ref=e749]: 🔍 Card Zoom & Search
      - button "?" [ref=e750] [cursor=pointer]
    - textbox "Search card name" [ref=e752]:
      - /placeholder: Search card name�
  - generic [ref=e755]:
    - generic [ref=e756]: Karte
    - button "Schlie�en" [ref=e757] [cursor=pointer]: �
  - text: Close Close Close
  - text: Close
```

# Test source

```ts
  1   | // @ts-check
  2   | const { test, expect } = require('@playwright/test');
  3   | 
  4   | const BASE = 'http://127.0.0.1:8000';
  5   | 
  6   | /**
  7   |  * Helper: navigate to playtester tab and wait for board to load
  8   |  */
  9   | async function openPlaytester(page) {
> 10  |     await page.goto(BASE + '/index.html');
      |                ^ Error: page.goto: Test timeout of 60000ms exceeded.
  11  |     // Click the Playtester menu item
  12  |     const menuTrigger = page.locator('#mainMenuTrigger');
  13  |     if (await menuTrigger.isVisible()) await menuTrigger.click();
  14  |     // Try clicking data-tab-id="playtester" from menu
  15  |     const ptMenuItem = page.locator('[data-tab-id="playtester"]');
  16  |     await ptMenuItem.click({ timeout: 5000 });
  17  |     // Wait for the playtester board to become visible
  18  |     await page.locator('#playtester-board').waitFor({ state: 'visible', timeout: 10000 });
  19  | }
  20  | 
  21  | /**
  22  |  * Helper: start a game with a known deck
  23  |  */
  24  | async function startGame(page) {
  25  |     // Wait for deck selector or start button
  26  |     await page.waitForTimeout(1500);
  27  |     // Type a sample deck list into the deck textarea if it exists
  28  |     const deckTextarea = page.locator('#ptDeckInput, #ptDecklistTextarea, textarea[id*="deck"]').first();
  29  |     if (await deckTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
  30  |         await deckTextarea.fill('4 Ultra Ball SVI 196\n4 Nest Ball SVI 181\n4 Professor\'s Research SVI 189\n4 Boss\'s Orders PAL 172\n4 Iono PAL 185\n4 Rare Candy SVI 191\n4 Super Rod PAL 188\n20 Basic Fire Energy SVE 2\n4 Arcanine ex OBF 32\n4 Growlithe OBF 31\n4 Charizard ex OBF 125\n');
  31  |     }
  32  |     // Click start button
  33  |     const startBtn = page.locator('button:has-text("Start"), button:has-text("Playtest"), [onclick*="startPlaytest"], [onclick*="ptStartGame"]').first();
  34  |     if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  35  |         await startBtn.click();
  36  |         await page.waitForTimeout(1000);
  37  |     }
  38  | }
  39  | 
  40  | test.describe('Playtester Hand Buttons', () => {
  41  | 
  42  |     test('Legend box is hidden', async ({ page }) => {
  43  |         await openPlaytester(page);
  44  |         const legend = page.locator('.pt-legend-box');
  45  |         // Legend should exist in DOM but not be visible
  46  |         if (await legend.count() > 0) {
  47  |             await expect(legend.first()).toBeHidden();
  48  |         }
  49  |     });
  50  | 
  51  |     test('Play button exists on trainer cards in hand and is clickable', async ({ page }) => {
  52  |         await openPlaytester(page);
  53  |         await startGame(page);
  54  |         await page.waitForTimeout(1500);
  55  | 
  56  |         // Check if hand zone has cards
  57  |         const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
  58  |         const count = await handCards.count();
  59  | 
  60  |         if (count > 0) {
  61  |             // Hover over the first card to reveal buttons
  62  |             await handCards.first().hover();
  63  |             await page.waitForTimeout(300);
  64  | 
  65  |             // Check for play or discard buttons
  66  |             const playBtn = page.locator('.pt-hand-play-btn').first();
  67  |             const discBtn = page.locator('.pt-hand-disc-btn').first();
  68  | 
  69  |             // At least discard button should be visible on hover
  70  |             const discVisible = await discBtn.isVisible().catch(() => false);
  71  |             expect(discVisible).toBe(true);
  72  | 
  73  |             // Check z-index: buttons should be above the card image
  74  |             if (await playBtn.isVisible().catch(() => false)) {
  75  |                 const btnZ = await playBtn.evaluate(el => getComputedStyle(el).zIndex);
  76  |                 const imgZ = await handCards.first().locator('img').evaluate(el => getComputedStyle(el).zIndex);
  77  |                 expect(parseInt(btnZ)).toBeGreaterThan(parseInt(imgZ) || 0);
  78  |             }
  79  |         }
  80  |     });
  81  | 
  82  |     test('Play button does NOT open card viewer', async ({ page }) => {
  83  |         await openPlaytester(page);
  84  |         await startGame(page);
  85  |         await page.waitForTimeout(1500);
  86  | 
  87  |         const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
  88  |         const count = await handCards.count();
  89  | 
  90  |         if (count > 0) {
  91  |             // Find a trainer card with play button
  92  |             for (let i = 0; i < count; i++) {
  93  |                 const wrapper = handCards.nth(i);
  94  |                 await wrapper.hover();
  95  |                 await page.waitForTimeout(200);
  96  | 
  97  |                 const playBtn = wrapper.locator('.pt-hand-play-btn');
  98  |                 if (await playBtn.isVisible().catch(() => false)) {
  99  |                     // Click the play button
  100 |                     await playBtn.click();
  101 |                     await page.waitForTimeout(500);
  102 | 
  103 |                     // Card viewer should NOT be visible
  104 |                     const viewer = page.locator('#ptCardViewer');
  105 |                     const viewerDisplay = await viewer.evaluate(el => el.style.display).catch(() => 'none');
  106 |                     expect(viewerDisplay).not.toBe('flex');
  107 | 
  108 |                     // The card should have been removed from hand (played)
  109 |                     const newCount = await handCards.count();
  110 |                     expect(newCount).toBeLessThan(count);
```