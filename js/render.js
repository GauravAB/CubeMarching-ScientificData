

var cubeStrip = [
	1, 1, 0,
	0, 1, 0,
	1, 1, 1,
	0, 1, 1,
	0, 0, 1,
	0, 1, 0,
	0, 0, 0,
	1, 1, 0,
	1, 0, 0,
	1, 1, 1,
	1, 0, 1,
	0, 0, 1,
	1, 0, 0,
	0, 0, 0
];

//globals

var canvas = null;
var gl = null;
var isovalue = null;
var currentIsovalue = -1.0;
var WIDHT = 640;
var HEIGHT = 480;
var camera = null;
var projView = null;
var invView = null;
var proj = null;
var invProj = null;
var WIDTH = null;
var HEIGHT = null;
var targetFrameTime = 32;
var samplingRate = 0.5;


//surface data
var surfaceShader = null;
var surfaceVao = null;
var surfaceVbo = null;
var isosurfaceNumVerts = 0;

var renderTargets  = null;
var depthColorFbo = null;
var colorFbo = null;
var blitImageShader = null;



//volume data
var volumeVao = null;
var volumeShader = null;
var volumeTexture = null;
var volDims = null;
var volScale = null;
var volumeData = null;

const defaultEye = vec3.set(vec3.create(),0.5,0.5,1.5);
const center = vec3.set(vec3.create(),0.5,0.5,0.5);
const up = vec3.set(vec3.create(),0.0,1.0,0.0);


var loadVolume = function(selection, onload)
{
    var file = "js/local_skull_256x256x256_uint8.raw";
    var volDims = [256,256,256];

    var req = new XMLHttpRequest();
    req.open("GET",file,true);
    req.responseType = "arraybuffer";
    req.onprogress = function(evt){

        var vol_size = volDims[0] * volDims[1] * volDims[2];
        var percent = evt.loaded / vol_size * 100;
    }

    req.onload = function(evt)
    {
        var respBuf = req.response;
        if(respBuf)
        {
            var dataBuffer = new Uint8Array(respBuf);
            onload(file, dataBuffer);
        }
        else{
            alert("Unable to load buffer properly from volume");
            console.log("no buffer loaded ?");
        }
    };

    req.send();
}


var selectVolume = function()
{
    //hard coded selection for now
    var selection = null;

    loadVolume(selection, function(file, dataBuffer)
    {
        volDims = [256,256,256];
        var tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D,tex);
        gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, volDims[0], volDims[1], volDims[2]);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texSubImage3D(gl.TEXTURE_3D, 0,0,0,0,volDims[0],volDims[1],volDims[2],gl.RED,gl.UNSIGNED_BYTE,dataBuffer);
        var longestAxis = Math.max(volDims[0],Math.max(volDims[1],volDims[2]));
        volScale  = [volDims[0]/ longestAxis, volDims[1]/longestAxis,volDims[2]/longestAxis];
      
        volumeData = dataBuffer;
        if(!volumeTexture)
        {
            volumeTexture = tex;
            setInterval(renderLoop,targetFrameTime);
        }
        else
        {
            gl.deleteTexture(volumeTexture);
            volumeTexture = tex;
        }
    });
}

var renderLoop = function()
{
    if(document.hidden)
    {
        return; 
    }

    gl.clearColor(1.0,1.0,1.0,1.0);
    gl.clearDepth(1.0);

    projView = mat4.mul(projView, proj, camera.camera);
    invView = mat4.invert(invView, camera.camera);

    //position of eye in world
    var eye = [camera.invCamera[12],camera.invCamera[13],camera.invCamera[14]];

    // //render isosurface
     gl.bindFramebuffer(gl.FRAMEBUFFER, depthColorFbo);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    if(currentIsovalue != isovalue)
    {     
       currentIsovalue = isovalue;

       var triangles;
       var computeTime;

       var t0 = performance.now();
       triangles = marchingCubesJS(volumeData, volDims, currentIsovalue / 255.0);
       var t1 = performance.now();
       computeTime =  t1 - t0;

       isosurfaceNumVerts = triangles.length / 3;
    
       gl.bindBuffer(gl.ARRAY_BUFFER, surfaceVbo);
       gl.bufferData(gl.ARRAY_BUFFER,triangles,gl.DYNAMIC_DRAW);
    }

    var startTime = new Date();
    if(isosurfaceNumVerts > 0)
    {
        surfaceShader.use(gl);
        gl.disable(gl.CULL_FACE);
        gl.uniform1f(surfaceShader.uniforms["isovalue"],currentIsovalue / 255.0);
        gl.uniform3iv(surfaceShader.uniforms["volume_dims"],volDims);
        gl.uniform3fv(surfaceShader.uniforms["volume_scale"],volScale);
        gl.uniform3fv(surfaceShader.uniforms["eye_pos"],eye);
        gl.uniformMatrix4fv(surfaceShader.uniforms["proj_view"],false,projView);

        gl.disable(gl.CULL_FACE);
        gl.bindVertexArray(surfaceVao);
        gl.drawArrays(gl.TRIANGLES, 0, isosurfaceNumVerts);
        gl.enable(gl.CULL_FACE);
    }

    //render the volume on top of the isosurface
    gl.disable(gl.DEPTH_TEST);
    gl.cullFace(gl.FRONT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, colorFbo);
    gl.bindVertexArray(volumeVao);
    volumeShader.use(gl);
    gl.uniform3iv(volumeShader.uniforms["volume_dims"],volDims);
    gl.uniform3fv(volumeShader.uniforms["volume_scale"],volScale);
    gl.uniform3fv(volumeShader.uniforms["eye_pos"],eye);
    gl.uniform1f(volumeShader.uniforms["dt_scale"],samplingRate);
    gl.uniformMatrix4fv(volumeShader.uniforms["proj_view"],false,projView);
    gl.uniformMatrix4fv(volumeShader.uniforms["inv_proj"],false,invProj);
    gl.uniformMatrix4fv(volumeShader.uniforms["inv_view"],false,invView);
    
    gl.bindVertexArray(volumeVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0 , cubeStrip.length / 3);

    //final blit
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    blitImageShader.use(gl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0 , 4);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);


    gl.finish();
    var endTime = new Date();
    var renderTime = endTime - startTime;
    var targetSamplingRate = renderTime / targetFrameTime;

    startTime = endTime;
}




var run = function()
{

    canvas = document.getElementById("glcanvas");
    gl = canvas.getContext("webgl2");
    if(!gl)
    {
        alert("Unable to initialize webGL2. Your browser is trash!");
        return;
    }
  
    //hardcoded isovalue for now
    isovalue =200;

    WIDTH = canvas.clientWidth;
    HEIGHT = canvas.clientHeight;


    //projection matrix
    proj = mat4.perspective(mat4.create(),60*Math.PI/180.0,WIDHT/HEIGHT,0.1,100);
    invProj = mat4.invert(mat4.create(),proj);

    camera = new ArcballCamera(defaultEye, center, up, 2, [WIDTH,HEIGHT]);
    
    projView = mat4.create();
    invView = mat4.create();


    
    //mouse and touch controllers
    var controller = new Controller();
    controller.mousemove = function(prev, cur, evt)
    {
        if(evt.buttons == 1)
        {
            camera.rotate(prev,cur);
        }
        else if(evt.buttons == 2)
        {
            camera.pan([cur[0] - prev[0],prev[1]-cur[1]]);
        }
    };
    
    controller.wheel = function(amt) {camera.zoom(amt);}
    controller.pinch = controller.wheel;
    controller.twoFingerDrag = function(drag) {camera.pan(drag);};
    controller.registerForCanvas(canvas);


    //Raymarching shader buffers
    volumeVao = gl.createVertexArray();
    gl.bindVertexArray(volumeVao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(cubeStrip),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);

    volumeShader = new Shader(gl, vertShader,fragShader);
    volumeShader.use(gl);
    gl.uniform1i(volumeShader.uniforms["volume"],0);
    gl.uniform1i(volumeShader.uniforms["colormap"],1);
    gl.uniform1i(volumeShader.uniforms["depth"], 4);
    gl.uniform1f(volumeShader.uniforms["dt_scale"], 1.0);
    gl.uniform2iv(volumeShader.uniforms["canvas_dims"], [WIDTH,HEIGHT]);
    
    //surface stuff
    surfaceVao = gl.createVertexArray();
    surfaceVbo = gl.createBuffer();
    gl.bindVertexArray(surfaceVao);
    gl.bindBuffer(gl.ARRAY_BUFFER,surfaceVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0,3,gl.FLOAT, false, 0,0);
    surfaceShader = new Shader(gl, isosurfaceVertShader, isosurfaceFragShader);
    surfaceShader.use(gl);
    gl.uniform1i(surfaceShader.uniforms["colormap"],1);
    

    blitImageShader = new Shader(gl,quadVertShader, quadFragShader);
    blitImageShader.use(gl);
    gl.uniform1i(blitImageShader.uniforms["colors"],3);


    //opengl state for drawing the back faces and compositing with background
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);


    //Framebuffers
    renderTargets  = [gl.createTexture(), gl.createTexture()];
    gl.bindTexture(gl.TEXTURE_2D, renderTargets[0]);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, WIDTH, HEIGHT);
    gl.bindTexture(gl.TEXTURE_2D, renderTargets[1]);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, WIDTH, HEIGHT);


    for(var i = 0; i < 2; i++)
    {
        gl.bindTexture(gl.TEXTURE_2D, renderTargets[i]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
    }

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, renderTargets[0]);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D,renderTargets[1]);

    depthColorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, depthColorFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,renderTargets[0],0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,renderTargets[1],0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    colorFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,colorFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,renderTargets[0],0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

    //Load the default colormap and upload it , after which we load the default volume

    var colormapImage = new Image();
    colormapImage.onload = function()
    {
        var colormap = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, colormap);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, 180, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,180,1,gl.RGBA,gl.UNSIGNED_BYTE,colormapImage);
            
        selectVolume();
    };

    colormapImage.src = "colormaps/cool-warm-paraview.png";
}

window.onload = function()
{
    run();
}






