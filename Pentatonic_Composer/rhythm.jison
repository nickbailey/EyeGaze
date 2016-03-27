/* rhythm.jioson:
 * Parses end executes simple rhythms for Pentatonic_Composer
 *
 * Nick Bailey, March 2016
 */

/* lexical grammar */
%lex

%%
\s+                   /* skip whitespace */
[1-9]*[0-9]+          return 'INT';
"."                   return '.';
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
    
bars
    : r
        { $$ = [$1]; }
    | bars BAR r
        { $$ = $1.concat([$3]); }
    ;
    
r
    : atom
        { $$ = $1; }
    |  r SEP atom
        { $$ = $1.concat($3); }
    ;
    
atom
    : INT
        { $$ = [ 4.0/parseFloat($1) ]; }
    | INT '.'
        { $$ = [ 1.5 * 4.0/parseFloat($1) ]; }
    | '(' atom IN atom ')' TUPLE atom
        { $$ = $7.map(function(v){ return v * $2[0]/$4[0]; }); }
    | '(' atom REPEAT INT ')'
        { $$ = Array.from({length: $4}, () => $2[0]); }
    | '(' r ')'
        { $$ = $2; }
    ;