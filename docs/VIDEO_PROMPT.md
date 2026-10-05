# КБ-13 · видео-визитка: концепт и промпт

Идея та же, что у сайта: **белое поле, крупный голос, красный разряд**. Видео короткое (24–30 с), горизонтальное 16:9, без диктора; смысл несут кадр, типографика и разряд. Все надписи взяты из прототипа (`content.ru.json`), новых рекламных фраз нет.

В репозитории уже лежит отрисованная моушн-версия: `assets/video/kb13-vizitka.mp4` (1920×1080, 30 fps, 24,5 с, звук синтезирован). Её исходник — `video/render.html` + `video/render.js`, пересборка — `node scripts/render-video.mjs`. Промпт ниже нужен для живой (генеративной или студийной) версии того же сценария.

## Правила

- Персонажи — постановочные, из комплекта (6 человек в чёрно-белой гамме). Не подписывать их как сотрудников бюро, не давать имён.
- Палитра: тёплая бумага #F5F4F0, чёрный #0B0B0B, единственный цвет — красный #F20D0D (молния, трубка, карандаш, ремень камеры). Никакого синего, фиолетового, неона, тёмного фона.
- Молния — красная, реалистичная, с почти белым ядром и розовым ореолом на бумаге. Главный канал идёт по фирменной диагонали знака КБ13: снизу-слева вверх-вправо с двумя изломами.
- Надписи монтажёр накладывает сам (шрифт Druk Condensed / резерв Sofia Sans Extra Condensed 900, прописные). Генеративной модели текст рисовать **не** поручаем — она его искажает.
- Без выдуманных цифр, клиентов, кейсов, отзывов и логотипов соцсетей.

## Сценарий (≈25 с)

| Время | Кадр | Надпись (монтаж) | Звук |
| --- | --- | --- | --- |
| 0–3 с | Пустой лист бумаги во весь кадр. По диагонали снизу-слева вверх-вправо ударяет красный разряд, бумага на миг вспыхивает розовым. Разряд гаснет, из него проявляется знак КБ13. | — (знак КБ13) | сухой треск, низкий раскат |
| 3–7 с | Справа въезжает кинокамера на штативе, рука на объективе, красный ремень. Красные уголки фокуса защёлкиваются на линзе. | ВНИМАНИЕ – НОВАЯ ВАЛЮТА! · Человек отдал своё время? Отдаст и деньги! Знаем на что ваша аудитория готова отдать своё время | щелчок фокуса |
| 7–11,5 с | Человек в чёрном свитшоте держит пустую табличку (на ней монтажом: «Одна система от идеи до заявки, без случайных постов.»). За его спиной проходит разряд, фигура чуть поднимается. | ЭМОЦИИ - ЛЮДЯМ. РЕЗУЛЬТАТ - БИЗНЕСУ · Вызываем желание купить, через системный подход к маркетингу в соц.сетях. | удар, раскат |
| 11,5–16 с | Крупно рука с красным карандашом на бумаге. От грифеля «вытекает» светящаяся красная линия, ветвится и в конце вспыхивает настоящим разрядом. | КРЕАТИВ ПО РАСЧЕТУ · Оригинальных рекламных решений превращаем «хочу» в «беру» · Эмоции в рекламных решениях, как инструмент приводящий покупателей | шорох грифеля → треск |
| 16–20 с | Женщина в чёрной рубашке с красной телефонной трубкой улыбается в камеру; у уха — рисованные «звоночные» дуги; от трубки вверх уходит разряд. | ДАВАЙ ДРУЖИТЬ! · Поэтому ваш проект для нас не очередной, а тот самый! Нам ваш результат нужен НЕ меньше, чем вам. | звонок старого телефона, треск |
| 20–25 с | Горизонтальная «паутина» разряда через кадр, над ней знак КБ13, под ней направления. | КБ13 · КРЕАТИВ / СОЦСЕТИ / КОММУНИКАЦИЯ | финальный раскат, тишина |

Склейки между сценами — короткий диагональный разряд через весь кадр и белая вспышка бумаги на 4–5 кадров.

## Промпт для генеративной модели (EN, для Sora / Veo / Kling / Runway)

Генерировать по сценам (5 отдельных клипов по 4–5 с), затем собрать в монтаже с надписями.

**Общий стиль (добавлять к каждой сцене):**

> Minimalist premium studio commercial, warm off-white paper backdrop (#F5F4F0), seamless, soft diffused key light, gentle shadows. Black-and-white wardrobe and props; the only color in frame is a vivid pure red (#F20D0D). Photoreal, 35mm, shallow depth of field, crisp detail, editorial fashion-campaign look. A realistic red electric lightning discharge with a near-white hot core, fine fractal branches and a soft pink bloom on the paper; it flickers 2–3 times like a real return stroke and then holds. Calm, confident camera; slow push-in or locked-off. 16:9, 24 fps, no text, no logos, no watermarks.

**Сцена 1 — разряд и знак:**

> Locked-off top-down shot of a clean sheet of warm white paper filling the frame. A single realistic red lightning bolt strikes diagonally from the bottom-left corner to the top-right corner, with two sharp kinks along the way and thin branching forks. The paper briefly glows pink around the bolt, then the bolt dims to a faint red trace. Empty center left for a logo.

**Сцена 2 — внимание:**

> A professional black cinema camera on a black tripod slides into frame from the right on a warm white seamless backdrop; a hand in a black sleeve rests on the lens; a vivid red camera strap hangs down. The lens catches a tiny red reflection. Negative space on the left third for typography. Slow push-in toward the lens.

**Сцена 3 — человек с табличкой:**

> A friendly man in his thirties with curly dark hair and black glasses, black crewneck sweatshirt, holds a blank white placard at chest height with both hands, looking at the camera with a calm half-smile. Black-and-white grading on the person; behind him a realistic red lightning bolt crosses the backdrop diagonally from lower left to upper right, partly hidden by his body. He rises very slightly as if lifted by the energy. The placard stays blank, flat and fully visible.

**Сцена 4 — карандаш:**

> Close-up of a hand in a black sleeve holding a red pencil on warm white paper. From the pencil tip a glowing red line is drawn across the paper toward the lower left, branching like lightning; when the line is complete it flares into a real red electric discharge with a white-hot core, flickers twice and holds. Macro detail of paper fibers, soft light.

**Сцена 5 — на связи:**

> A confident woman with shoulder-length dark wavy hair in an oversized black shirt holds a glossy red retro telephone handset to her ear, its red coiled cord hanging down; she smiles at the camera. Black-and-white grading except the vivid red handset and cord. A thin red lightning arc rises from the handset into the empty upper-right part of the warm white backdrop.

**Сцена 6 — финал:**

> Wide locked-off shot of an empty warm white seamless backdrop. A horizontal web of realistic red lightning crawls across the middle of the frame from left to right, flickers and settles into a frozen glowing trace. Generous empty space above it for a logo and below it for a single line of text.

**Негативный промпт (для моделей, которые его принимают):**

> text, letters, captions, subtitles, logos, watermark, social media icons, numbers, charts, dark background, night sky, storm clouds, rain, blue or purple lightning, neon cyberpunk, glossy 3D, lens flare overload, extra fingers, distorted hands, warped faces, cartoon, low resolution, camera shake, fast cuts

## Технические требования к финальному файлу

- 1920×1080 (и при необходимости 1080×1920 для соцсетей), H.264 High, 24–30 fps, `+faststart`, AAC 160 кбит/с.
- Постер — кадр со сценой «человек с табличкой», WebP 1280 px.
- Утверждённое название ролика пока не передано: в плеере используется нейтральное «Видео-визитка КБ-13».
- Подключение на сайте — через `site.config.json` → `video.url` и `video.poster`, затем `node scripts/build.mjs`.
