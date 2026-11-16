# DEAD AIR

A free co-op ghost-hunting game in the browser, for 1 to 4 players with proximity voice chat.

You're a tiny paranormal channel. Every night the van drops the crew at an abandoned place. Grab the camcorder, film the weird stuff for views, and get the tapes back to the van by 6 a.m. Three nights a season: hit the view quota or the channel is terminated.

- **Film the weird:** a floating chair, a TV with a face, lawn flamingos that move when nobody's looking, a knocking wardrobe, a balloon that follows you, a mannequin that only dances in your headlamp.
- **Don't get taken:** Mr. Applause (a game-show host with a too-big smile) hears voices and running. The hand steals whatever you're holding. Throw junk at them.
- **Your screams are content:** the best 8 seconds of every tape, with the sound the camcorder heard, play in the upload after each night.

## Play

`node serve.js`, then open http://localhost:8080 (the microphone needs localhost or https).

Keyboard and mouse, Xbox / PlayStation / Steam Deck / Switch Pro controllers, or a phone held sideways. Installable as an app.

## Tests

Headless Chrome, no dependencies: `node tools/smoke.mjs`, `node tools/mp.mjs` (two browsers over PeerJS, needs internet), `node tools/creatures.mjs`, `node tools/mobile.mjs`, `node tools/gallery.mjs`. Screenshots go to `tools/shots/`.
