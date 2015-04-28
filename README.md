forked from [tmp demo group](https://github.com/tmp-demo/touch-me-together) to supply a [Docker image](https://registry.hub.docker.com/u/chris1911/rev2015-touch-me-together/). Get ready:

```
	docker pull chris1911/rev2015-touch-me-together  
	docker run -d -p 3000:3000 chris1911/rev2015-touch-me-together
```  

All credits go to: [tmp.graphics](http://tmp.graphics). Thx for this funny demo!!!

Original Readme.md follows:
# Touch me together

> Multiplayer rhythm game released at the [Revision 2015](http://2015.revision-party.net/) with 122 players!

![Screenshot](https://raw.githubusercontent.com/tmp-demo/touch-me-together/master/Screenshot.png)

A master screen displays the track (ideally with a huge video projector) and plays the audio. Party people grab their smartphone, go to a specific URL, and play together.

Because it was specifically made for the Revision, there is only one song, which includes a tutorial section. Moreover it was made over two weeks, so don't expect anything.

## Installation

	npm install
	node .

By default, the master screen go to <http://localhost:3000/#plop> and party people to <http://localhost:3000/>. The master can exit from a loop by pressing the right arrow, and write a custom message on the screen by pressing Enter.

## Credits

Code by Bloutiouf

Music by wsmind

Inspired by [Groove Coaster](http://groovecoaster.com/)
