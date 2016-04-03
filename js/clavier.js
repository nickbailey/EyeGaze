/* WebAPI initialisation */
if (typeof theAudioContext === 'undefined') {
  try {
    var audio_context_call = window.AudioContext || window.webkitAudioContext;
    theAudioContext = new audio_context_call();
  } catch (err) {
    alert("Exception raised while creating an AudioContext instance.\n"
        + "Maybe your browser doesn't support WebAudio?\n"
	+ "Error report follows.\n"
	+ err);
  }
}

if (typeof theMasterGain === 'undefined') {
  var theMasterGain = theAudioContext.createGain()
  theMasterGain.gain.value = 0.6;
  theMasterGain.connect(theAudioContext.destination);
}

/* Make a "global" place to store audio generator handles */
if (typeof audioSources === 'undefined') {
  var audioSources = [];	// Maps handles to Keys.
}

/* A modulo function which works as expected */
Number.prototype.mod = function(n) { return ((this%n)+n)%n; }

function Key(index, kbType) {
  // Step 0 is C, because that's where the octave number changes.
  var keysPer8ve = kbType['layout'].length;
  this.handle = audioSources.length;	// Used for interactive callbacks
  audioSources[this.handle] = this;
  this.step = index.mod(keysPer8ve);
  this.octave = Math.floor(index/keysPer8ve);
  this.kbtype = kbType;
  // But the pitch is defined by A.
  this.f0 = kbType['A']
	      * Math.pow(kbType['hcr'], index - kbType['A_index']);
  this.svgElement = null;		// the SVG displying this key
  //console.log('New key. step=' + this.step
  //             + ' octave=' + this.octave
  //             + ' f0=' + this.f0);
}

Key.prototype.getSVG = function() {
  var keyDesc = this.kbtype['layout'][this.step];
  // A rectangle for the key
  var keyX = (keyDesc['x'] + this.octave*this.kbtype['octaveWidth']);
  var svg = '<rect vector-effect="non-scaling-stroke" '
	      + 'x="' + keyX + '" '
	      + 'y="' + keyDesc['y'] + '" '
	      + 'width="' + keyDesc['w'] + '" '
	      + 'height="' + keyDesc['h'] + '" '
	      + 'id="key_' + this.handle + '" '
	      + 'class="key_' + keyDesc['key_style'] +'" state="up" '
	      + 'onmousedown="playNote(' + this.handle + ');" '
	      + 'ontouchstart="playNote(' + this.handle + ');" '
	      + 'onmouseup="stopNote(' + this.handle +');" />\n';
	      + 'ontouchend="stopNote(' + this.handle +');" />\n';
  return svg;
}

Key.prototype.getSVGLabel = function() {
  var noteNames = this.kbtype['layout'][this.step]['name'];
  var svg = '';
  //console.log(noteNames);
  for (var i = 0; i < noteNames.length; i++)
    svg += '<tspan x="0" dy="16">' + noteNames[i] + '</tspan>\n';
  var cents = 1200 * Math.log(this.f0/this.kbtype['A'])/Math.log(2);
  svg += '<tspan x="0" dy="14" class="keyLabelCents">'
           + Math.round(cents).mod(1200)
	   + '</tspan>';
  return svg;
}
Key.prototype.getLayer = function() {
  return this.kbtype['layout'][this.step]['z'];
}
/* A Key has an attribute "state" which says whether it's pressed
 * It's value is either "down" or "up".
 */
Key.prototype.setState = function(state) {
  if (!this.svgElement) {
    // Cache the SVG element displaying the key
    this.svgElement = document.getElementById('key_'+this.handle);
  }
  this.svgElement.setAttribute("state", state);
}

/* Interaction handlers */
/* The argument is the handle of the key capturuing the event
   The key's reference is stored it the association audioSources.
   We might have to find the SVG element corresponding to this
   key because there's no way it could be known before the SVG
   describing the key got rendered. If so it's cached in the key
   so we can use it again next time.
*/
function playNote(which) {
  // Ignore undefined notes
  if (which === undefined) return;

  // Can't restart an oscillator. Create a new one.
  // If one is running already, we probably received
  // a duplicate event (e.g. a touchstart followed
  // by a syntheic mousedown on a touch screen device)
  var keyStruck = audioSources[which];
  if (keyStruck.oscillator)
    return;
  
  // Otherwise, here's our new oscillator
  var osc = theAudioContext.createOscillator();
  osc.frequency.value=keyStruck.f0;
  // New envelope shaper too.
  var gain;
  if (!keyStruck.gainControl) {
    //console.log("New gain control!");
    gain = theAudioContext.createGain();
    gain.connect(theMasterGain);
  } else {
    gain = audioSources[which].gainControl;
  }
  osc.connect(gain);
  osc.start(0);
  var now = theAudioContext.currentTime;
  gain.gain.cancelScheduledValues(0);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now+0.2);
  
  keyStruck.oscillator  = osc;
  keyStruck.gainControl = gain;
  
  keyStruck.setState('down');
}

function stopNote(which) {
  // Ignore undefined notes
  if (which === undefined) return;

  // If the oscillator assoicated with this key isn't running,
  // just change the element's appearance.
  var keyReleased = audioSources[which];
  if (keyReleased.oscillator) {
    var now = theAudioContext.currentTime;
    keyReleased.gainControl.gain.cancelScheduledValues(now);
    keyReleased.gainControl.gain.linearRampToValueAtTime(0, now+0.3);
    keyReleased.oscillator.stop(now+0.3);
    keyReleased.oscillator = null;
  }
  keyReleased.setState('up');
}

/* Class to generate SVG for a keyboard of a given type. */
function Keyboard(type, startkey, numkeys) {
  this.kbtype = type;
  this.startKey = startkey;
  this.numKeys = numkeys;
  this.keys = [];
}

/* Layout specification for one octave of the keyboard */
/* x, y, w and h are scaled to match the keyboard width
    and key height when the keyboard is rendered.
    z is 0 for the "white" keys and 1 for the "black"
    and refers to the order in which the rectangles are
    drawn (the nearest thing to a z coordinate in svg).
    name is a list of names of the note, presented as a
    vertical stack the center of which is at the key centre
    horizontally and offset from the top of the key by
    y_label vertically. As well as names, a layout may
    supply enharmonic_equiv. These aren't used to label
    the keys but are searched when a lilypond note is
    supplied. Thus silly numbers of sharps and flats
    can be supported without cluttering up the key labels.
    The key_style string is appended to "key_" to set
    the key's CSS class. The state attribute of each
    key may be "up" or "down"; this is used to provide
    visual feedback on which keys are sounding. */
Keyboard.KEYBOARD_19DO_FBSPLIT_MODERN = {
  'octaveWidth': 7,			// Physical width of 8ve in keys
  'A': 440.0,				// Frequency of A4
  'A_index': 14,			// Which key plays A4
  'hcr': Math.pow(2.0, 1.0/19.0),	// One hyperchromatic step
  'layout': [
    { 'x':0, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['C'], 'y_label':0.8 },
    { 'x':0.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['C\u266f','D\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':0.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['C\uD834\uDD2A', 'D\u266d'], 'y_label':0.13 },
    { 'x':1, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['D'], 'y_label':0.8 },
    { 'x':1.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['D\u266f','E\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':1.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['D\uD834\uDD2A','E\u266d'], 'y_label':0.13 },
    { 'x':2, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['E'], 'y_label':0.8 },
    { 'x':2.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['E\u266f','F\u266d'], 'y_label':0.3 },
    { 'x':3, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['F'], 'y_label':0.8 },
    { 'x':3.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['F\u266f','G\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':3.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['F\uD834\uDD2A','G\u266d'], 'y_label':0.13 },
    { 'x':4, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['G'], 'y_label':0.8 },
    { 'x':4.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['G\u266f','A\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':4.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['G\uD834\uDD2A','A\u266d'], 'y_label':0.13 },
    { 'x':5, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['A'], 'y_label':0.8 },
    { 'x':5.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['A\u266f','B\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':5.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['A\uD834\uDD2A','B\u266d'], 'y_label':0.13 },
    { 'x':6, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['B'], 'y_label':0.8 },
    { 'x':6.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['B\u266f','C\u266d'], 'y_label':0.3 }
  ]
};
Keyboard.KEYBOARD_19DO_FBSPLIT_ANCIENT = {
  'octaveWidth': 7,			// Physical width of 8ve in keys
  'A': 440.0,				// Frequency of A4
  'A_index': 14,			// Which key plays A4
  'hcr': Math.pow(2.0, 1.0/19.0),	// One hyperchromatic step
  'layout': [
    { 'x':0, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['C'], 'y_label':0.8 },
    { 'x':0.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['C\u266f','D\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':0.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['C\uD834\uDD2A', 'D\u266d'], 'y_label':0.13 },
    { 'x':1, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['D'], 'y_label':0.8 },
    { 'x':1.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['D\u266f','E\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':1.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['D\uD834\uDD2A','E\u266d'], 'y_label':0.13 },
    { 'x':2, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['E'], 'y_label':0.8 },
    { 'x':2.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['E\u266f','F\u266d'], 'y_label':0.3 },
    { 'x':3, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['F'], 'y_label':0.8 },
    { 'x':3.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['F\u266f','G\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':3.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['F\uD834\uDD2A','G\u266d'], 'y_label':0.13 },
    { 'x':4, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['G'], 'y_label':0.8 },
    { 'x':4.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['G\u266f','A\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':4.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['G\uD834\uDD2A','A\u266d'], 'y_label':0.13 },
    { 'x':5, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['A'], 'y_label':0.8 },
    { 'x':5.5, 'y':0, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['A\u266f','B\uD834\uDD2B'], 'y_label':0.13 },
    { 'x':5.5, 'y':0.33, 'z':1, 'w':1, 'h':0.33, 'key_style':'accidental',
      'name':['A\uD834\uDD2A','B\u266d'], 'y_label':0.13 },
    { 'x':6, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['B'], 'y_label':0.8 },
    { 'x':6.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['B\u266f','C\u266d'], 'y_label':0.3 }
  ]
};
Keyboard.KEYBOARD_12DO = {
  'octaveWidth': 7,			// Physical width of 8ve in keys
  'A': 440.0,				// Frequency of A4
  'A_index': 9,				// Which key plays A4
  'hcr': Math.pow(2.0, 1.0/12.0),	// One hyperchromatic step
  'layout': [
    { 'x':0, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['C'], 'y_label':0.8,
      'enharmonic_equiv':['D\uD834\uDD2B', 'B\u266f'] },
    { 'x':0.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['C\u266f','D\u266d'], 'y_label':0.33 },
    { 'x':1, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['D'], 'y_label':0.8,
      'enharmonic_equiv':['E\uD834\uDD2B', 'C\uD834\uDD2B'] },
    { 'x':1.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['D\u266f','E\u266d'], 'y_label':0.33 },
    { 'x':2, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['E'], 'y_label':0.8,
      'enharmonic_equiv':['D\uD834\uDD2A', 'F\u266d'] },
    { 'x':3, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['F'], 'y_label':0.8,
      'enharmonic_equiv':['E\u266f', 'G\uD834\uDD2B'] },
    { 'x':3.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['F\u266f','G\u266d'], 'y_label':0.33 },
    { 'x':4, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['G'], 'y_label':0.8,
      'enharmonic_equiv':['F\uD834\uDD2A', 'G\uD834\uDD2B'] },
    { 'x':4.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['G\u266f','A\u266d'], 'y_label':0.33 },
    { 'x':5, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['A'], 'y_label':0.8,
      'enharmonic_equiv':['G\uD834\uDD2A', 'B\uD834\uDD2B'] },
    { 'x':5.5, 'y':0, 'z':1, 'w':1, 'h':0.66, 'key_style':'accidental',
      'name':['A\u266f','B\u266d'], 'y_label':0.33 },
    { 'x':6, 'y':0, 'z':0, 'w':1, 'h':1, 'key_style':'natural',
      'name':['B'], 'y_label':0.8,
      'enharmonic_equiv':['A\uD834\uDD2A', 'C\u266d'] },
  ]
};

/* Generated SVG has text labels on keys if labels === true.
    size is [keyWidth, keyboardHeight] (default 48,240) */
Keyboard.prototype.make_svg
  = function(labels, size) {
  var keyWidth;		// Key width in pixels
  var keyboardHeight;	// Height of whole keyboard
  
  if (size === undefined) {
    keyWidth = 48;
    keyboardHeight = 240;
  } else {
    keyWidth = size[0];
    keyboardHeight = size[1];
  }
  
  var svgLayer = ['', ''];
  for (i = this.startKey;
	i < this.startKey+this.numKeys;
	i++) {
    var keyIndex = i-this.startKey;
    this.keys[keyIndex] = new Key(i, this.kbtype);
    // svg requires the "lower" items to be drawn first
    // So we'll save the svg layer by layer, then spit it out
    // in the right order at the end.
    var l = this.keys[keyIndex].getLayer();
    // Draw a polygon, offsetting the key according to it's position
    svgLayer[l] += this.keys[keyIndex].getSVG();
  }
  // For now, we'll assume at most 2 layers.
  // This might change.
  var leftmostX = this.kbtype['layout'][this.keys[0]['step']]['x']
		  + this.keys[0]['octave'] * this.kbtype['octaveWidth'];
  var rightKey = this.keys.length - 1;
  var rightmostX = this.kbtype['layout'][this.keys[rightKey]['step']]['x']
                  + this.kbtype['layout'][this.keys[rightKey]['step']]['w']
                  + this.keys[rightKey]['octave'] * this.kbtype['octaveWidth'];
  var svgHead = '<svg ' + 'height="' + keyboardHeight
		    + '" width="' + keyWidth*(rightmostX-leftmostX) + '">\n'
		    + '<g transform="scale(' + keyWidth
		      +  ',' + keyboardHeight + '), '
		      + 'translate(' + (-leftmostX)
		      + ',0)">\n';
  var svg = svgHead + svgLayer[0] + svgLayer[1] + '</g>\n';
  //console.log('\n\nLayer 0:\n'+svgLayer[0]);
  //console.log('\n\nLayer 1:\n'+svgLayer[1]);
  
  // Finally add the labels if required.
  // These don't use the asymmetric scales like the keyboard drawing
  // did because it messes up the fonts. They are presented centered
  // in each key, at the y coordinate specified in the keyboard layout.
  if (labels) {
    svg += '<g transform="translate(' + (-keyWidth*leftmostX) + ',0)">\n';
    for (var i = 0; i < this.keys.length; i++) {
      var keyDesc = this.kbtype['layout'][this.keys[i].step];
      var x = keyWidth*( this.keys[i].octave*this.kbtype['octaveWidth']
			  + keyDesc['x'] + 0.5 );
      svg += '<text text-anchor="middle" class="keyLabel" '
		+ 'transform="translate(' + x + ','
		+ (keyboardHeight*(keyDesc['y'] + keyDesc['y_label'])
		    - 8*keyDesc['name'].length - 4) + ')" >\n';
      svg += this.keys[i].getSVGLabel();
      svg += '\n</text>\n';
    }
  }
  return(svg + '</svg>\n');
}

Keyboard.prototype.silence = function() {
  for (var key in this.keys)
    stopNote(this.keys[key].handle);
}

/* Return a maping of key names to Key offset by examining
 * the possible name of each key object */
Keyboard.prototype.getKeyNameMap = function() {
  var map = {};
  for (var i=0;
       i < this.kbtype['layout'].length && i < this.keys.length;
       i++) {
    var keyDesc = this.keys[i];
    var noteNames = keyDesc.kbtype['layout'][keyDesc.step]['name'];
    for (var name in noteNames)
      map[noteNames[name]] = i;
    // As well as a "name", this step on the keyboard might also
    // have a "enharmonic_equivs".
    noteNames = keyDesc.kbtype['layout'][keyDesc.step]['enharmonic_equiv'];
    if (noteNames)
      for (var name in noteNames)
	map[noteNames[name]] = i;
  }
  
  // Deal with enharmonic equivalents at the C boundary.
  // Keys flat of C will have an index ending up in an
  // octave too high.
  for (var name in map) 
    if (name[0] == 'C' && map[name] > map['D'])
      map[name] -= this.kbtype['layout'].length;
  //console.log(map);
  return map;
}
