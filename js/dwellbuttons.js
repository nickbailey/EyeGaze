// Load necessary styles
$('head').append('<link rel="stylesheet" href="../css/dwellbuttons.css" type="text/css" />');

// Find which button in a dwellgroup is selected
function selected(d) {
    var group = d.closest('.dwellgroup');
    return group.find('.selected').index();
}

$(document).ready(function() {
    
    $('.dwell, .dwelltoggle').mouseenter(function() {
        var dwellbar = $(this).find('div.dwellbar');
        dwellbar.css('width', '0px');
        dwellbar.css('visibility', 'visible');
        dwellbar.animate({width:'50%'},
                         dwell,
                         function() {
                             $(this).click();
                             dwellbar.css('visibility', 'hidden');
                         });
    });
    
    $('.dwell, .dwelltoggle').mouseleave(function() {
        var dwellbar = $(this).find("div.dwellbar");
        dwellbar.stop();
        dwellbar.css('visibility', 'hidden');
    });
    
    $('.dwelltoggle').bind('click', function() {
        $(this).toggleClass('selected');
    });
    
    $('.dwellgroup > .dwell').bind('click', function() {
        $(this).siblings().removeClass('selected');
        $(this).addClass('selected');
        //console.log(selected($(this)));
    });
    
    
    $('.dwell, .dwelltoggle').prepend('<div class="dwellbar"></div>');
    $('.dwellbar').css('visibility', 'hidden');
    $('.dwellgroup').children('div.dwell').first().addClass('selected');
    
});
