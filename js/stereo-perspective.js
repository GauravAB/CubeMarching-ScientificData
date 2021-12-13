

//inter pupillary distance in mm
var ipd = 64;
var focalLength = 40;
var eyeRelief = 18;
var distLensScreen = 39;
var screenWidth = 132.5;
var pixelPitch = screenWidth / 1920; // divide by horizontal resolution


function computeLensMagnification()
{
    return focalLength / (focalLength - distLensScreen);
}

function computeDistanceScreenViewer()
{
    var d = 1 / (Math.abs((1/focalLength) - (1/distLensScreen)));
}

function computePerspectiveTransform(l , r, t, b, n ,f)
{
    return mat4.frustum(mat4.create(),l,r,b,t,n,f);
}

function computeTBLR(clipNear, clipFar, width ,height)
{
    var znear = clipNear;
    var M = computeLensMagnification();
    var distScreenViewer = computeDistanceScreenViewer();
    
    
    //following stanford notes from here to find left eye TBLR and right eye TBLR
    var w1 =  M * (ipd / 2);
    var wprimew = width * pixelPitch;
    var wprimeh = height * pixelPitch;
    var w2w = M * (wprimew - ipd) / 2;

    //image formation on left eye
    var lefteyeRight = znear * (w1 / (distScreenViewer));
    var lefteyeLeft = -znear * (w2w / (distScreenViewer));

    //image formation on right eye
    var righteyeRight = znear * (w2w / (distScreenViewer));
    var righteyeLeft = -znear * (w1 / (distScreenViewer));

    var top = znear * M * wprimeh / 2 / distScreenViewer;
    var bottom = -top;

    return {
        topL : top, bottomL: bottom, leftL: lefteyeLeft, rightL: lefteyeRight,
        topR : top, bottomR: bottom, leftR: righteyeLeft, rightR: righteyeRight,
    };
}

function stereoProjMatLeft(clipNear, clipFar, width, height)
{
    var projParams = computeTBLR(clipNear, clipFar, width, height);

    return computePerspectiveTransform(projParams.leftL, projParams.rightL, projParams.topL, projParams.bottomL,clipNear,clipFar);
}


function stereoProjMatRight(clipNear, clipFar, width, height)
{
    var projParams = computeTBLR(clipNear, clipFar, width, height);

    return computePerspectiveTransform(projParams.leftR, projParams.rightR, projParams.topR, projParams.bottomR,clipNear,clipFar);
}
