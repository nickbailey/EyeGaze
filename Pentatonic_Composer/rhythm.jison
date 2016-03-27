/* rhythm.jioson:
 * Parses end executes simple rhythms for Pentatonic_Composer
 *
 * Nick Bailey, March 2016
 */

/* lexical grammar */
%lex
/* Omitting the flex option makes the parser faster but requires
 * tokens to end with a word boundary, so no good for us!
 */
%options flex

%%
\s+                   /* skip whitespace */
[1-9]*[0-9]+          return 'INT';
"."                   return '.';
"_"                   return 'TIE';
","                   return 'SEP';
"("                   return '(';
")"                   return ')';
"*"                   return 'REPEAT';
":"                   return 'TUPLE';
"in"                  return 'IN';
"|"                   return 'BAR';
<<EOF>>               return 'EOF';

/lex

%start rhythm

%% /* language grammar */

rhythm
    : bars EOF
        { return $$; }
    ;

/* The rhythm consists of bars, i.e. one or more sequences separated by '|'. */
bars
    : sequence
        { $$ = [$1]; }
    | bars BAR sequence
        { $$ = $1.concat([$3]); }
    ;

/* A sequence is one or more comma-separated groups */
sequence
    : group
        { $$ = $1; }
    | sequence SEP group
        {{
            /* Ties result in -ve durations for 2nd and subsequent notes.
             * Except at the start of a bar, these need to be merged
             * into single events
             */
            for (var i = 0; i < $3.length; i++)
                if ($3[i] > 0 || $1.length == 0) 
                    $1.push($3[i]);
                else
                    $1[$1.length-1] += -$3[i];
            /* $$ = $1.concat($3); */
            
        }}
    ;

/* A group is either:
 *      a single note
 *      a group preceded by a "(value in value):" tuplet declaration
 *      a group repeated n times "(group * n)", or
 *      a bracket-enclosed sequence, e.g. (4., 8)
 */
group
    : value
        { $$ = [$1]; }
    | '(' simple IN simple ')' TUPLE group
        { $$ = $7.map(function(v){ return v * $2/$4; }); }
    | '(' group REPEAT INT ')'
        /* concat.apply() flattens the array of arrays into a single array */
        { $$ = Array.from({length: $4}, () => [].concat.apply([],$2)); }
    | '(' sequence ')'
        { $$ = $2; }
    ;

/* Length of a note in beats */
value
    : simple
        { $$ = $1; }
    | TIE simple
        { $$ = -$2; }
    ;

simple
    : INT
        { $$ = 4.0/parseFloat($1); }
    | INT '.'
        { $$ = 1.5 * 4.0/parseFloat($1); }
    ;
