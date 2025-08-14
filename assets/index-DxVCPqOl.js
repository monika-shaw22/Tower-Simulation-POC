(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))r(a);new MutationObserver(a=>{for(const o of a)if(o.type==="childList")for(const u of o.addedNodes)u.tagName==="LINK"&&u.rel==="modulepreload"&&r(u)}).observe(document,{childList:!0,subtree:!0});function i(a){const o={};return a.integrity&&(o.integrity=a.integrity),a.referrerPolicy&&(o.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?o.credentials="include":a.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function r(a){if(a.ep)return;a.ep=!0;const o=i(a);fetch(a.href,o)}})();var ee=Object.defineProperty,te=(t,e,i)=>e in t?ee(t,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):t[e]=i,n=(t,e,i)=>te(t,typeof e!="symbol"?e+"":e,i),ie=`#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D particlesSpeed;

in vec2 v_textureCoordinates;

out vec4 fragColor;

void main() {
    // 获取当前粒子的位置
    vec2 currentPos = texture(currentParticlesPosition, v_textureCoordinates).rg;
    // 获取粒子的速度
    vec2 speed = texture(particlesSpeed, v_textureCoordinates).rg;
    // 计算下一个位置
    vec2 nextPos = currentPos + speed;
    
    // 将新的位置写入 fragColor
    fragColor = vec4(nextPos, 0.0, 1.0);
}
`,re=`#version 300 es

// the size of UV textures: width = lon, height = lat
uniform sampler2D U; // eastward wind
uniform sampler2D V; // northward wind
uniform sampler2D currentParticlesPosition; // (lon, lat, lev)

uniform vec2 uRange; // (min, max)
uniform vec2 vRange; // (min, max)
uniform vec2 speedRange; // (min, max)
uniform vec2 dimension; // (lon, lat)
uniform vec2 minimum; // minimum of each dimension
uniform vec2 maximum; // maximum of each dimension

uniform float speedScaleFactor;
uniform float frameRateAdjustment;

in vec2 v_textureCoordinates;

vec2 getInterval(vec2 maximum, vec2 minimum, vec2 dimension) {
    return (maximum - minimum) / (dimension - 1.0);
}

vec2 mapPositionToNormalizedIndex2D(vec2 lonLat) {
    // ensure the range of longitude and latitude
    lonLat.x = clamp(lonLat.x, minimum.x, maximum.x);
    lonLat.y = clamp(lonLat.y,  minimum.y, maximum.y);

    vec2 interval = getInterval(maximum, minimum, dimension);
    
    vec2 index2D = vec2(0.0);
    index2D.x = (lonLat.x - minimum.x) / interval.x;
    index2D.y = (lonLat.y - minimum.y) / interval.y;

    vec2 normalizedIndex2D = vec2(index2D.x / dimension.x, index2D.y / dimension.y);
    return normalizedIndex2D;
}

float getWindComponent(sampler2D componentTexture, vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    float result = texture(componentTexture, normalizedIndex2D).r;
    return result;
}

vec2 getWindComponents(vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    float u = texture(U, normalizedIndex2D).r;
    float v = texture(V, normalizedIndex2D).r;
    return vec2(u, v);
}

vec2 bilinearInterpolation(vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;

    vec2 interval = getInterval(maximum, minimum, dimension);

    // Calculate grid cell coordinates
    float lon0 = floor(lon / interval.x) * interval.x;
    float lon1 = lon0 + interval.x;
    float lat0 = floor(lat / interval.y) * interval.y;
    float lat1 = lat0 + interval.y;

    // Get wind vectors at four corners
    vec2 v00 = getWindComponents(vec2(lon0, lat0));
    vec2 v10 = getWindComponents(vec2(lon1, lat0));
    vec2 v01 = getWindComponents(vec2(lon0, lat1));
    vec2 v11 = getWindComponents(vec2(lon1, lat1));

    // Check if all wind vectors are zero
    if (length(v00) == 0.0 && length(v10) == 0.0 && length(v01) == 0.0 && length(v11) == 0.0) {
        return vec2(0.0, 0.0);
    }

    // Calculate interpolation weights
    float s = (lon - lon0) / interval.x;
    float t = (lat - lat0) / interval.y;

    // Perform bilinear interpolation on vector components
    vec2 v0 = mix(v00, v10, s);
    vec2 v1 = mix(v01, v11, s);
    return mix(v0, v1, t);
}

vec2 lengthOfLonLat(vec2 lonLat) {
    // unit conversion: meters -> longitude latitude degrees
    // see https://en.wikipedia.org/wiki/Geographic_coordinate_system#Length_of_a_degree for detail

    // Calculate the length of a degree of latitude and longitude in meters
    float latitude = radians(lonLat.y);

    float term1 = 111132.92;
    float term2 = 559.82 * cos(2.0 * latitude);
    float term3 = 1.175 * cos(4.0 * latitude);
    float term4 = 0.0023 * cos(6.0 * latitude);
    float latLength = term1 - term2 + term3 - term4;

    float term5 = 111412.84 * cos(latitude);
    float term6 = 93.5 * cos(3.0 * latitude);
    float term7 = 0.118 * cos(5.0 * latitude);
    float longLength = term5 - term6 + term7;

    return vec2(longLength, latLength);
}

vec2 convertSpeedUnitToLonLat(vec2 lonLat, vec2 speed) {
    vec2 lonLatLength = lengthOfLonLat(lonLat);
    float u = speed.x / lonLatLength.x;
    float v = speed.y / lonLatLength.y;
    vec2 windVectorInLonLat = vec2(u, v);

    return windVectorInLonLat;
}

vec2 calculateSpeedByRungeKutta2(vec2 lonLat) {
    // see https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods#Second-order_methods_with_two_stages for detail
    const float h = 0.5;

    vec2 y_n = lonLat;
    vec2 f_n = bilinearInterpolation(lonLat);
    vec2 midpoint = y_n + 0.5 * h * convertSpeedUnitToLonLat(y_n, f_n) * speedScaleFactor;
    vec2 speed = h * bilinearInterpolation(midpoint) * speedScaleFactor;

    return speed;
}


vec2 calculateWindNorm(vec2 speed) {
    float speedLength = length(speed.xy);
    if(speedLength == 0.0){
      return vec2(0.0);
    }

    // Clamp speedLength to range
    float clampedSpeed = clamp(speedLength, speedRange.x, speedRange.y);
    float normalizedSpeed = (clampedSpeed - speedRange.x) / (speedRange.y - speedRange.x);
    return vec2(speedLength, normalizedSpeed);
}

out vec4 fragColor;

void main() {
    // texture coordinate must be normalized
    vec2 lonLat = texture(currentParticlesPosition, v_textureCoordinates).rg;
    vec2 speedOrigin = bilinearInterpolation(lonLat);
    vec2 speed = calculateSpeedByRungeKutta2(lonLat) * frameRateAdjustment;
    vec2 speedInLonLat = convertSpeedUnitToLonLat(lonLat, speed);

    fragColor = vec4(speedInLonLat, calculateWindNorm(speedOrigin));
}
`,ae=`#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, norm)

// range (min, max)
uniform vec2 lonRange;
uniform vec2 latRange;

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

uniform float randomCoefficient;
uniform float dropRate;
uniform float dropRateBump;

// 添加新的 uniform 变量
uniform bool useViewerBounds;

in vec2 v_textureCoordinates;

// pseudo-random generator
const vec3 randomConstants = vec3(12.9898, 78.233, 4375.85453);
const vec2 normalRange = vec2(0.0, 1.0);
float rand(vec2 seed, vec2 range) {
    vec2 randomSeed = randomCoefficient * seed;
    float temp = dot(randomConstants.xy, randomSeed);
    temp = fract(sin(temp) * (randomConstants.z + temp));
    return temp * (range.y - range.x) + range.x;
}

vec2 generateRandomParticle(vec2 seed) {
    vec2 range;
    float randomLon, randomLat;
    
    if (useViewerBounds) {
        // 在当前视域范围内生成粒子
        randomLon = rand(seed, lonRange);
        randomLat = rand(-seed, latRange);
    } else {
        // 在数据范围内生成粒子
        randomLon = rand(seed, dataLonRange);
        randomLat = rand(-seed, dataLatRange);
    }

    return vec2(randomLon, randomLat);
}

bool particleOutbound(vec2 particle) {
    return particle.y < dataLatRange.x || particle.y > dataLatRange.y || particle.x < dataLonRange.x || particle.x > dataLonRange.y;
}

out vec4 fragColor;

void main() {
    vec2 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rg;
    vec4 nextSpeed = texture(particlesSpeed, v_textureCoordinates);
    float speedNorm = nextSpeed.a;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed1 = nextParticle.xy + v_textureCoordinates;
    vec2 seed2 = nextSpeed.rg + v_textureCoordinates;
    vec2 randomParticle = generateRandomParticle(seed1);
    float randomNumber = rand(seed2, normalRange);

    if (randomNumber < particleDropRate || particleOutbound(nextParticle)) {
        fragColor = vec4(randomParticle, 0.0, 1.0); // 1.0 means this is a random particle
    } else {
        fragColor = vec4(nextParticle, 0.0, 0.0);
    }
}
`,ne=`#version 300 es
precision highp float;

in vec2 st;
in vec3 normal;

uniform sampler2D previousParticlesPosition;
uniform sampler2D currentParticlesPosition;
uniform sampler2D postProcessingPosition;
uniform sampler2D particlesSpeed;

uniform float frameRateAdjustment;
uniform float particleHeight;
uniform float aspect;
uniform float pixelSize;
uniform vec2 lineWidth;
uniform vec2 lineLength;
uniform vec2 domain;
uniform bool is3D;

// 添加输出变量传递给片元着色器
out vec4 speed;
out float v_segmentPosition;
out vec2 textureCoordinate;

// 添加结构体定义
struct adjacentPoints {
    vec4 previous;
    vec4 current;
    vec4 next;
};

vec3 convertCoordinate(vec2 lonLat) {
    // WGS84 (lon, lat, lev) -> ECEF (x, y, z)
    // read https://en.wikipedia.org/wiki/Geographic_coordinate_conversion#From_geodetic_to_ECEF_coordinates for detail

    // WGS 84 geometric constants
    float a = 6378137.0; // Semi-major axis
    float b = 6356752.3142; // Semi-minor axis
    float e2 = 6.69437999014e-3; // First eccentricity squared

    float latitude = radians(lonLat.y);
    float longitude = radians(lonLat.x);

    float cosLat = cos(latitude);
    float sinLat = sin(latitude);
    float cosLon = cos(longitude);
    float sinLon = sin(longitude);

    float N_Phi = a / sqrt(1.0 - e2 * sinLat * sinLat);
    float h = particleHeight; // it should be high enough otherwise the particle may not pass the terrain depth test
    vec3 cartesian = vec3(0.0);
    cartesian.x = (N_Phi + h) * cosLat * cosLon;
    cartesian.y = (N_Phi + h) * cosLat * sinLon;
    cartesian.z = ((b * b) / (a * a) * N_Phi + h) * sinLat;
    return cartesian;
}

vec4 calculateProjectedCoordinate(vec2 lonLat) {
    if (is3D) {
        vec3 particlePosition = convertCoordinate(lonLat);
        // 使用 modelViewProjection 矩阵进行投影变换
        vec4 projectedPosition = czm_modelViewProjection * vec4(particlePosition, 1.0);
        return projectedPosition;
    } else {
        vec3 position2D = vec3(radians(lonLat.x), radians(lonLat.y), 0.0);
        return czm_modelViewProjection * vec4(position2D, 1.0);
    }
}

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign, float widthFactor) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    // 计算方向向量
    vec2 direction = normalize(pointB_XY - pointA_XY);

    // 计算法向量
    vec2 normalVector = vec2(-direction.y, direction.x);
    normalVector.x = normalVector.x / aspect;

    // 使用 widthFactor 调整宽度
    float offsetLength = widthFactor * lineWidth.y;
    normalVector = offsetLength * normalVector;

    vec4 offset = vec4(offsetSign * normalVector, 0.0, 0.0);
    return offset;
}

void main() {
    // 翻转 Y 轴坐标
    vec2 flippedIndex = vec2(st.x, 1.0 - st.y);

    vec2 particleIndex = flippedIndex;
    speed = texture(particlesSpeed, particleIndex);

    vec2 previousPosition = texture(previousParticlesPosition, particleIndex).rg;
    vec2 currentPosition = texture(currentParticlesPosition, particleIndex).rg;
    vec2 nextPosition = texture(postProcessingPosition, particleIndex).rg;

    float isAnyRandomPointUsed = texture(postProcessingPosition, particleIndex).a +
        texture(currentParticlesPosition, particleIndex).a +
        texture(previousParticlesPosition, particleIndex).a;

    adjacentPoints projectedCoordinates;
    if (isAnyRandomPointUsed > 0.0) {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = projectedCoordinates.previous;
        projectedCoordinates.next = projectedCoordinates.previous;
    } else {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = calculateProjectedCoordinate(currentPosition);
        projectedCoordinates.next = calculateProjectedCoordinate(nextPosition);
    }

    int pointToUse = int(normal.x);
    float offsetSign = normal.y;
    vec4 offset = vec4(0.0);

    // 计算速度相关的宽度和长度因子
    float speedLength = clamp(speed.b, domain.x, domain.y);
    float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
    
    // 根据速度计算宽度
    float widthFactor = mix(lineWidth.x, lineWidth.y, normalizedSpeed);
    widthFactor *= (pointToUse < 0 ? 1.0 : 0.5); // 头部更宽，尾部更窄

    // Calculate length based on speed
    float lengthFactor = mix(lineLength.x, lineLength.y, normalizedSpeed) * pixelSize;

    if (pointToUse == 1) {
        // 头部位置
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0; // 头部
    } else if (pointToUse == -1) {
        // Get direction and normalize it to length 1.0
        vec4 direction = normalize(projectedCoordinates.next - projectedCoordinates.current);
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0; // 尾部
    }

    textureCoordinate = st;
}
`,oe=`#version 300 es
precision highp float;

in vec4 speed;
in float v_segmentPosition;
in vec2 textureCoordinate;

uniform vec2 domain;
uniform vec2 displayRange;
uniform sampler2D colorTable;
uniform sampler2D segmentsDepthTexture;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.a > zero && speed.b > displayRange.x && speed.b < displayRange.y) {
        float speedLength = clamp(speed.b, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        // 使用更平滑的渐变效果
        float alpha = smoothstep(0.0, 1.0, v_segmentPosition);
        alpha = pow(alpha, 1.5); // 调整透明度渐变曲线

        // 根据速度调整透明度
        float speedAlpha = mix(0.3, 1.0, speed.a);

        // 组合颜色和透明度
        fragColor = vec4(baseColor.rgb, baseColor.a * alpha * speedAlpha);
    } else {
        fragColor = vec4(zero);
    }

    float segmentsDepth = texture(segmentsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));
    if (segmentsDepth < globeDepth) {
        fragColor = vec4(zero);
    }
}
`,S=class{static getCalculateSpeedShader(){return new Cesium.ShaderSource({sources:[re]})}static getUpdatePositionShader(){return new Cesium.ShaderSource({sources:[ie]})}static getSegmentDrawVertexShader(){return new Cesium.ShaderSource({sources:[ne]})}static getSegmentDrawFragmentShader(){return new Cesium.ShaderSource({sources:[oe]})}static getPostProcessingPositionShader(){return new Cesium.ShaderSource({sources:[ae]})}},D=class{constructor(t){n(this,"commandType"),n(this,"geometry"),n(this,"attributeLocations"),n(this,"primitiveType"),n(this,"uniformMap"),n(this,"vertexShaderSource"),n(this,"fragmentShaderSource"),n(this,"rawRenderState"),n(this,"framebuffer"),n(this,"outputTexture"),n(this,"autoClear"),n(this,"preExecute"),n(this,"show"),n(this,"commandToExecute"),n(this,"clearCommand"),n(this,"isDynamic"),this.commandType=t.commandType,this.geometry=t.geometry,this.attributeLocations=t.attributeLocations,this.primitiveType=t.primitiveType,this.uniformMap=t.uniformMap||{},this.vertexShaderSource=t.vertexShaderSource,this.fragmentShaderSource=t.fragmentShaderSource,this.rawRenderState=t.rawRenderState,this.framebuffer=t.framebuffer,this.outputTexture=t.outputTexture,this.autoClear=Cesium.defaultValue(t.autoClear,!1),this.preExecute=t.preExecute,this.show=!0,this.commandToExecute=void 0,this.clearCommand=void 0,this.isDynamic=t.isDynamic??(()=>!0),this.autoClear&&(this.clearCommand=new Cesium.ClearCommand({color:new Cesium.Color(0,0,0,0),depth:1,framebuffer:this.framebuffer,pass:Cesium.Pass.OPAQUE}))}createCommand(t){if(this.commandType==="Draw"){const e=Cesium.VertexArray.fromGeometry({context:t,geometry:this.geometry,attributeLocations:this.attributeLocations,bufferUsage:Cesium.BufferUsage.STATIC_DRAW}),i=Cesium.ShaderProgram.fromCache({context:t,vertexShaderSource:this.vertexShaderSource,fragmentShaderSource:this.fragmentShaderSource,attributeLocations:this.attributeLocations}),r=Cesium.RenderState.fromCache(this.rawRenderState);return new Cesium.DrawCommand({owner:this,vertexArray:e,primitiveType:this.primitiveType,modelMatrix:Cesium.Matrix4.IDENTITY,renderState:r,shaderProgram:i,framebuffer:this.framebuffer,uniformMap:this.uniformMap,pass:Cesium.Pass.OPAQUE})}else{if(this.commandType==="Compute")return new Cesium.ComputeCommand({owner:this,fragmentShaderSource:this.fragmentShaderSource,uniformMap:this.uniformMap,outputTexture:this.outputTexture,persists:!0});throw new Error("Unknown command type")}}setGeometry(t,e){this.geometry=e,Cesium.defined(this.commandToExecute)&&(this.commandToExecute.vertexArray=Cesium.VertexArray.fromGeometry({context:t,geometry:this.geometry,attributeLocations:this.attributeLocations,bufferUsage:Cesium.BufferUsage.STATIC_DRAW}))}update(t){if(this.isDynamic()&&!(!this.show||!Cesium.defined(t))){if(Cesium.defined(this.commandToExecute)||(this.commandToExecute=this.createCommand(t.context)),Cesium.defined(this.preExecute)&&this.preExecute(),!t.commandList){console.warn("frameState.commandList is undefined");return}Cesium.defined(this.clearCommand)&&t.commandList.push(this.clearCommand),Cesium.defined(this.commandToExecute)&&t.commandList.push(this.commandToExecute)}}isDestroyed(){return!1}destroy(){return Cesium.defined(this.commandToExecute)&&(this.commandToExecute.shaderProgram?.destroy(),this.commandToExecute.shaderProgram=void 0),Cesium.destroyObject(this)}};function T(t,e){if(!t)return e;if(!e)return t;const i={...e};for(const r in t)if(Object.prototype.hasOwnProperty.call(t,r)){const a=t[r],o=e[r];if(Array.isArray(a)){i[r]=a.slice();continue}if(a&&typeof a=="object"){i[r]=T(a,o||{});continue}a!==void 0&&(i[r]=a)}return i}var se=class{constructor(t,e,i,r,a){n(this,"context"),n(this,"options"),n(this,"viewerParameters"),n(this,"windTextures"),n(this,"particlesTextures"),n(this,"primitives"),n(this,"windData"),n(this,"frameRateMonitor"),n(this,"frameRate",60),n(this,"frameRateAdjustment",1),this.context=t,this.options=i,this.viewerParameters=r,this.windData=e,this.frameRateMonitor=new Cesium.FrameRateMonitor({scene:a,samplingWindow:1,quietPeriod:0}),this.initFrameRate(),this.createWindTextures(),this.createParticlesTextures(),this.createComputingPrimitives()}initFrameRate(){const t=()=>{this.frameRateMonitor.lastFramesPerSecond>20&&(this.frameRate=this.frameRateMonitor.lastFramesPerSecond,this.frameRateAdjustment=60/Math.max(this.frameRate,1))};t();const e=setInterval(t,1e3);this.frameRateMonitor.lowFrameRate.addEventListener((r,a)=>{console.warn(`Low frame rate detected: ${a} FPS`)}),this.frameRateMonitor.nominalFrameRate.addEventListener((r,a)=>{console.log(`Frame rate returned to normal: ${a} FPS`)});const i=this.destroy.bind(this);this.destroy=()=>{clearInterval(e),i()}}createWindTextures(){const t={context:this.context,width:this.windData.width,height:this.windData.height,pixelFormat:Cesium.PixelFormat.RED,pixelDatatype:Cesium.PixelDatatype.FLOAT,flipY:this.options.flipY??!1,sampler:new Cesium.Sampler({minificationFilter:Cesium.TextureMinificationFilter.LINEAR,magnificationFilter:Cesium.TextureMagnificationFilter.LINEAR})};this.windTextures={U:new Cesium.Texture({...t,source:{arrayBufferView:new Float32Array(this.windData.u.array)}}),V:new Cesium.Texture({...t,source:{arrayBufferView:new Float32Array(this.windData.v.array)}})}}createParticlesTextures(){const t={context:this.context,width:this.options.particlesTextureSize,height:this.options.particlesTextureSize,pixelFormat:Cesium.PixelFormat.RGBA,pixelDatatype:Cesium.PixelDatatype.FLOAT,flipY:!1,source:{arrayBufferView:new Float32Array(this.options.particlesTextureSize*this.options.particlesTextureSize*4).fill(0)},sampler:new Cesium.Sampler({minificationFilter:Cesium.TextureMinificationFilter.NEAREST,magnificationFilter:Cesium.TextureMagnificationFilter.NEAREST})};this.particlesTextures={previousParticlesPosition:new Cesium.Texture(t),currentParticlesPosition:new Cesium.Texture(t),nextParticlesPosition:new Cesium.Texture(t),postProcessingPosition:new Cesium.Texture(t),particlesSpeed:new Cesium.Texture(t)}}destroyParticlesTextures(){Object.values(this.particlesTextures).forEach(t=>t.destroy())}createComputingPrimitives(){this.primitives={calculateSpeed:new D({commandType:"Compute",uniformMap:{U:()=>this.windTextures.U,V:()=>this.windTextures.V,uRange:()=>new Cesium.Cartesian2(this.windData.u.min,this.windData.u.max),vRange:()=>new Cesium.Cartesian2(this.windData.v.min,this.windData.v.max),speedRange:()=>new Cesium.Cartesian2(this.windData.speed.min,this.windData.speed.max),currentParticlesPosition:()=>this.particlesTextures.currentParticlesPosition,speedScaleFactor:()=>(this.viewerParameters.pixelSize+50)*this.options.speedFactor,frameRateAdjustment:()=>this.frameRateAdjustment,dimension:()=>new Cesium.Cartesian2(this.windData.width,this.windData.height),minimum:()=>new Cesium.Cartesian2(this.windData.bounds.west,this.windData.bounds.south),maximum:()=>new Cesium.Cartesian2(this.windData.bounds.east,this.windData.bounds.north)},fragmentShaderSource:S.getCalculateSpeedShader(),outputTexture:this.particlesTextures.particlesSpeed,preExecute:()=>{const t=this.particlesTextures.previousParticlesPosition;this.particlesTextures.previousParticlesPosition=this.particlesTextures.currentParticlesPosition,this.particlesTextures.currentParticlesPosition=this.particlesTextures.postProcessingPosition,this.particlesTextures.postProcessingPosition=t,this.primitives.calculateSpeed.commandToExecute&&(this.primitives.calculateSpeed.commandToExecute.outputTexture=this.particlesTextures.particlesSpeed)},isDynamic:()=>this.options.dynamic}),updatePosition:new D({commandType:"Compute",uniformMap:{currentParticlesPosition:()=>this.particlesTextures.currentParticlesPosition,particlesSpeed:()=>this.particlesTextures.particlesSpeed},fragmentShaderSource:S.getUpdatePositionShader(),outputTexture:this.particlesTextures.nextParticlesPosition,preExecute:()=>{this.primitives.updatePosition.commandToExecute&&(this.primitives.updatePosition.commandToExecute.outputTexture=this.particlesTextures.nextParticlesPosition)},isDynamic:()=>this.options.dynamic}),postProcessingPosition:new D({commandType:"Compute",uniformMap:{nextParticlesPosition:()=>this.particlesTextures.nextParticlesPosition,particlesSpeed:()=>this.particlesTextures.particlesSpeed,lonRange:()=>this.viewerParameters.lonRange,latRange:()=>this.viewerParameters.latRange,dataLonRange:()=>new Cesium.Cartesian2(this.windData.bounds.west,this.windData.bounds.east),dataLatRange:()=>new Cesium.Cartesian2(this.windData.bounds.south,this.windData.bounds.north),randomCoefficient:function(){return Math.random()},dropRate:()=>this.options.dropRate,dropRateBump:()=>this.options.dropRateBump,useViewerBounds:()=>this.options.useViewerBounds},fragmentShaderSource:S.getPostProcessingPositionShader(),outputTexture:this.particlesTextures.postProcessingPosition,preExecute:()=>{this.primitives.postProcessingPosition.commandToExecute&&(this.primitives.postProcessingPosition.commandToExecute.outputTexture=this.particlesTextures.postProcessingPosition)},isDynamic:()=>this.options.dynamic})}}reCreateWindTextures(){this.windTextures.U.destroy(),this.windTextures.V.destroy(),this.createWindTextures()}updateWindData(t){this.windData=t,this.reCreateWindTextures()}updateOptions(t){const e=t.flipY!==void 0&&t.flipY!==this.options.flipY;this.options=T(t,this.options),e&&this.reCreateWindTextures()}processWindData(t){const{array:e}=t;let{min:i,max:r}=t;const a=new Float32Array(e.length);i===void 0&&(console.warn("min is undefined, calculate min"),i=Math.min(...e)),r===void 0&&(console.warn("max is undefined, calculate max"),r=Math.max(...e));const o=Math.max(Math.abs(i),Math.abs(r));for(let u=0;u<e.length;u++){const s=e[u]/o;a[u]=s}return console.log(a),a}destroy(){Object.values(this.windTextures).forEach(t=>t.destroy()),Object.values(this.particlesTextures).forEach(t=>t.destroy()),Object.values(this.primitives).forEach(t=>t.destroy()),this.frameRateMonitor.destroy()}},ue=class{constructor(t,e,i,r){n(this,"context"),n(this,"options"),n(this,"viewerParameters"),n(this,"computing"),n(this,"primitives"),n(this,"colorTable"),n(this,"textures"),n(this,"framebuffers"),this.context=t,this.options=e,this.viewerParameters=i,this.computing=r,(typeof this.options.particlesTextureSize!="number"||this.options.particlesTextureSize<=0)&&(console.error("Invalid particlesTextureSize. Using default value of 256."),this.options.particlesTextureSize=256),this.colorTable=this.createColorTableTexture(),this.textures=this.createRenderingTextures(),this.framebuffers=this.createRenderingFramebuffers(),this.primitives=this.createPrimitives()}createRenderingTextures(){const t={context:this.context,width:this.context.drawingBufferWidth,height:this.context.drawingBufferHeight,pixelFormat:Cesium.PixelFormat.RGBA,pixelDatatype:Cesium.PixelDatatype.UNSIGNED_BYTE},e={context:this.context,width:this.context.drawingBufferWidth,height:this.context.drawingBufferHeight,pixelFormat:Cesium.PixelFormat.DEPTH_COMPONENT,pixelDatatype:Cesium.PixelDatatype.UNSIGNED_INT};return{segmentsColor:new Cesium.Texture(t),segmentsDepth:new Cesium.Texture(e)}}createRenderingFramebuffers(){return{segments:new Cesium.Framebuffer({context:this.context,colorTextures:[this.textures.segmentsColor],depthTexture:this.textures.segmentsDepth})}}destoryRenderingFramebuffers(){Object.values(this.framebuffers).forEach(t=>{t.destroy()})}createColorTableTexture(){const t=new Float32Array(this.options.colors.flatMap(e=>{const i=Cesium.Color.fromCssColorString(e);return[i.red,i.green,i.blue,i.alpha]}));return new Cesium.Texture({context:this.context,width:this.options.colors.length,height:1,pixelFormat:Cesium.PixelFormat.RGBA,pixelDatatype:Cesium.PixelDatatype.FLOAT,sampler:new Cesium.Sampler({minificationFilter:Cesium.TextureMinificationFilter.LINEAR,magnificationFilter:Cesium.TextureMagnificationFilter.LINEAR,wrapS:Cesium.TextureWrap.CLAMP_TO_EDGE,wrapT:Cesium.TextureWrap.CLAMP_TO_EDGE}),source:{width:this.options.colors.length,height:1,arrayBufferView:t}})}createSegmentsGeometry(){const e=this.options.particlesTextureSize;let i=[];for(let s=0;s<e;s++)for(let d=0;d<e;d++)for(let c=0;c<4;c++)i.push(s/e),i.push(d/e);i=new Float32Array(i);const r=this.options.particlesTextureSize**2;let a=[];for(let s=0;s<r;s++)a.push(-1,-1,0,-1,1,0,1,-1,0,1,1,0);a=new Float32Array(a);let o=[];for(let s=0,d=0;s<r;s++)o.push(d+0,d+1,d+2,d+2,d+1,d+3),d+=4;return o=new Uint32Array(o),new Cesium.Geometry({attributes:new Cesium.GeometryAttributes({st:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:i}),normal:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.FLOAT,componentsPerAttribute:3,values:a})}),indices:o})}createRawRenderState(t){return Cesium.Appearance.getDefaultRenderState(!0,!1,{viewport:void 0,depthTest:void 0,depthMask:void 0,blending:void 0,...t})}createPrimitives(){return{segments:new D({commandType:"Draw",attributeLocations:{st:0,normal:1},geometry:this.createSegmentsGeometry(),primitiveType:Cesium.PrimitiveType.TRIANGLES,uniformMap:{previousParticlesPosition:()=>this.computing.particlesTextures.previousParticlesPosition,currentParticlesPosition:()=>this.computing.particlesTextures.currentParticlesPosition,postProcessingPosition:()=>this.computing.particlesTextures.postProcessingPosition,particlesSpeed:()=>this.computing.particlesTextures.particlesSpeed,frameRateAdjustment:()=>this.computing.frameRateAdjustment,colorTable:()=>this.colorTable,domain:()=>new Cesium.Cartesian2(this.options.domain?.min??this.computing.windData.speed.min,this.options.domain?.max??this.computing.windData.speed.max),displayRange:()=>new Cesium.Cartesian2(this.options.displayRange?.min??this.computing.windData.speed.min,this.options.displayRange?.max??this.computing.windData.speed.max),particleHeight:()=>this.options.particleHeight||0,aspect:()=>this.context.drawingBufferWidth/this.context.drawingBufferHeight,pixelSize:()=>this.viewerParameters.pixelSize,lineWidth:()=>{const e=this.options.lineWidth||A.lineWidth;return new Cesium.Cartesian2(e.min,e.max)},lineLength:()=>{const e=this.options.lineLength||A.lineLength;return new Cesium.Cartesian2(e.min,e.max)},is3D:()=>this.viewerParameters.sceneMode===Cesium.SceneMode.SCENE3D,segmentsDepthTexture:()=>this.textures.segmentsDepth},vertexShaderSource:S.getSegmentDrawVertexShader(),fragmentShaderSource:S.getSegmentDrawFragmentShader(),rawRenderState:this.createRawRenderState({viewport:void 0,depthTest:{enabled:!0},depthMask:!0,blending:{enabled:!0,blendEquation:WebGLRenderingContext.FUNC_ADD,blendFuncSource:WebGLRenderingContext.SRC_ALPHA,blendFuncDestination:WebGLRenderingContext.ONE_MINUS_SRC_ALPHA}})})}}onParticlesTextureSizeChange(){const t=this.createSegmentsGeometry();this.primitives.segments.geometry=t;const e=Cesium.VertexArray.fromGeometry({context:this.context,geometry:t,attributeLocations:this.primitives.segments.attributeLocations,bufferUsage:Cesium.BufferUsage.STATIC_DRAW});this.primitives.segments.commandToExecute&&(this.primitives.segments.commandToExecute.vertexArray=e)}onColorTableChange(){this.colorTable.destroy(),this.colorTable=this.createColorTableTexture()}updateOptions(t){const e=t.colors&&JSON.stringify(t.colors)!==JSON.stringify(this.options.colors);this.options=T(t,this.options),e&&this.onColorTableChange()}destroy(){Object.values(this.framebuffers).forEach(t=>{t.destroy()}),Object.values(this.primitives).forEach(t=>{t.destroy()}),this.colorTable.destroy()}},ce=class{constructor(t,e,i,r,a){n(this,"computing"),n(this,"rendering"),n(this,"options"),n(this,"viewerParameters"),n(this,"context"),this.context=t,this.options=i,this.viewerParameters=r,this.computing=new se(t,e,i,r,a),this.rendering=new ue(t,i,r,this.computing),this.clearFramebuffers()}getPrimitives(){return[this.computing.primitives.calculateSpeed,this.computing.primitives.updatePosition,this.computing.primitives.postProcessingPosition,this.rendering.primitives.segments]}clearFramebuffers(){const t=new Cesium.ClearCommand({color:new Cesium.Color(0,0,0,0),depth:1,framebuffer:void 0,pass:Cesium.Pass.OPAQUE});Object.keys(this.rendering.framebuffers).forEach(e=>{t.framebuffer=this.rendering.framebuffers[e],t.execute(this.context)})}changeOptions(t){let e=!1;t.particlesTextureSize&&this.options.particlesTextureSize!==t.particlesTextureSize&&(e=!0);const i=T(t,this.options);if(i.particlesTextureSize<1)throw new Error("particlesTextureSize must be greater than 0");this.options=i,this.rendering.updateOptions(t),this.computing.updateOptions(t),e&&(this.computing.destroyParticlesTextures(),this.computing.createParticlesTextures(),this.rendering.onParticlesTextureSizeChange())}applyViewerParameters(t){this.viewerParameters=t,this.computing.viewerParameters=t,this.rendering.viewerParameters=t}destroy(){this.computing.destroy(),this.rendering.destroy()}},A={particlesTextureSize:100,dropRate:.003,particleHeight:1e3,dropRateBump:.01,speedFactor:1,lineWidth:{min:1,max:2},lineLength:{min:20,max:100},colors:["white"],flipY:!1,useViewerBounds:!1,domain:void 0,displayRange:void 0,dynamic:!0},W=class j{constructor(e,i,r){n(this,"_show",!0),n(this,"_resized",!1),n(this,"windData"),n(this,"viewer"),n(this,"scene"),n(this,"options"),n(this,"particleSystem"),n(this,"viewerParameters"),n(this,"_isDestroyed",!1),n(this,"primitives",[]),n(this,"eventListeners",new Map),this.show=!0,this.viewer=e,this.scene=e.scene,this.options={...j.defaultOptions,...r},this.windData=this.processWindData(i),this.viewerParameters={lonRange:new Cesium.Cartesian2(-180,180),latRange:new Cesium.Cartesian2(-90,90),pixelSize:1e3,sceneMode:this.scene.mode},this.updateViewerParameters(),this.particleSystem=new ce(this.scene.context,this.windData,this.options,this.viewerParameters,this.scene),this.add(),this.setupEventListeners()}get show(){return this._show}set show(e){this._show!==e&&(this._show=e,this.updatePrimitivesVisibility(e))}setupEventListeners(){this.viewer.camera.percentageChanged=.01,this.viewer.camera.changed.addEventListener(this.updateViewerParameters.bind(this)),this.scene.morphComplete.addEventListener(this.updateViewerParameters.bind(this)),window.addEventListener("resize",this.updateViewerParameters.bind(this))}removeEventListeners(){this.viewer.camera.changed.removeEventListener(this.updateViewerParameters.bind(this)),this.scene.morphComplete.removeEventListener(this.updateViewerParameters.bind(this)),window.removeEventListener("resize",this.updateViewerParameters.bind(this))}processWindData(e){if(e.speed?.min===void 0||e.speed?.max===void 0||e.speed.array===void 0){const i={array:new Float32Array(e.u.array.length),min:Number.MAX_VALUE,max:Number.MIN_VALUE};for(let r=0;r<e.u.array.length;r++)i.array[r]=Math.sqrt(e.u.array[r]*e.u.array[r]+e.v.array[r]*e.v.array[r]),i.array[r]!==0&&(i.min=Math.min(i.min,i.array[r]),i.max=Math.max(i.max,i.array[r]));e={...e,speed:i}}return e}getDataAtLonLat(e,i){const{bounds:r,width:a,height:o,u,v:s,speed:d}=this.windData,{flipY:c}=this.options;if(e<r.west||e>r.east||i<r.south||i>r.north)return null;const l=(e-r.west)/(r.east-r.west)*(a-1);let m=(i-r.south)/(r.north-r.south)*(o-1);c&&(m=o-1-m);const x=Math.floor(l),C=Math.floor(m),w=Math.floor(l),L=Math.min(w+1,a-1),y=Math.floor(m),b=Math.min(y+1,o-1),h=l-w,f=m-y,E=C*a+x,B=y*a+w,z=y*a+L,I=b*a+w,O=b*a+L,Y=u.array[B],H=u.array[z],q=u.array[I],Z=u.array[O],R=(1-h)*(1-f)*Y+h*(1-f)*H+(1-h)*f*q+h*f*Z,J=s.array[B],X=s.array[z],Q=s.array[I],K=s.array[O],F=(1-h)*(1-f)*J+h*(1-f)*X+(1-h)*f*Q+h*f*K,$=Math.sqrt(R*R+F*F);return{original:{u:u.array[E],v:s.array[E],speed:d.array[E]},interpolated:{u:R,v:F,speed:$}}}updateViewerParameters(){const e=this.viewer.scene,i=e.canvas,r=[{x:0,y:0},{x:0,y:i.clientHeight},{x:i.clientWidth,y:0},{x:i.clientWidth,y:i.clientHeight}];let a=180,o=-180,u=90,s=-90,d=!1;for(const c of r){const l=e.camera.pickEllipsoid(new Cesium.Cartesian2(c.x,c.y),e.globe.ellipsoid);if(!l){d=!0;break}const m=e.globe.ellipsoid.cartesianToCartographic(l),x=Cesium.Math.toDegrees(m.longitude),C=Cesium.Math.toDegrees(m.latitude);a=Math.min(a,x),o=Math.max(o,x),u=Math.min(u,C),s=Math.max(s,C)}if(!d){const c=new Cesium.Cartesian2(Math.max(this.windData.bounds.west,a),Math.min(this.windData.bounds.east,o)),l=new Cesium.Cartesian2(Math.max(this.windData.bounds.south,u),Math.min(this.windData.bounds.north,s)),m=(c.y-c.x)*.05,x=(l.y-l.x)*.05;c.x=Math.max(this.windData.bounds.west,c.x-m),c.y=Math.min(this.windData.bounds.east,c.y+m),l.x=Math.max(this.windData.bounds.south,l.x-x),l.y=Math.min(this.windData.bounds.north,l.y+x),this.viewerParameters.lonRange=c,this.viewerParameters.latRange=l;const C=this.windData.bounds.east-this.windData.bounds.west,w=this.windData.bounds.north-this.windData.bounds.south,L=(c.y-c.x)/C,y=(l.y-l.x)/w,h=1e3*Math.min(L,y);h>0&&(this.viewerParameters.pixelSize=Math.max(0,Math.min(1e3,h)))}this.viewerParameters.sceneMode=this.scene.mode,this.particleSystem?.applyViewerParameters(this.viewerParameters)}updateWindData(e){this._isDestroyed||(this.windData=this.processWindData(e),this.particleSystem.computing.updateWindData(this.windData),this.viewer.scene.requestRender(),this.dispatchEvent("dataChange",this.windData))}updateOptions(e){this._isDestroyed||(this.options=T(e,this.options),this.particleSystem.changeOptions(e),this.viewer.scene.requestRender(),this.dispatchEvent("optionsChange",this.options))}zoomTo(e=0){if(this.windData.bounds){const i=Cesium.Rectangle.fromDegrees(this.windData.bounds.west,this.windData.bounds.south,this.windData.bounds.east,this.windData.bounds.north);this.viewer.camera.flyTo({destination:i,duration:e})}}add(){this.primitives=this.particleSystem.getPrimitives(),this.primitives.forEach(e=>{this.scene.primitives.add(e)})}remove(){this.primitives.forEach(e=>{this.scene.primitives.remove(e)}),this.primitives=[]}isDestroyed(){return this._isDestroyed}destroy(){this.remove(),this.removeEventListeners(),this.particleSystem.destroy(),this.eventListeners.clear(),this._isDestroyed=!0}updatePrimitivesVisibility(e){const i=e!==void 0?e:this._show;this.primitives.forEach(r=>{r.show=i})}addEventListener(e,i){this.eventListeners.has(e)||this.eventListeners.set(e,new Set),this.eventListeners.get(e)?.add(i)}removeEventListener(e,i){this.eventListeners.get(e)?.delete(i)}dispatchEvent(e,i){this.eventListeners.get(e)?.forEach(r=>r(i))}};n(W,"defaultOptions",A);var de=W;const le=[{id:"document",name:"CZML Model",version:"1.0",clock:{interval:"2019-06-01T16:00:00Z/2019-06-01T16:10:00Z",currentTime:"2019-06-01T16:00:00Z",multiplier:1e3,range:"LOOP_STOP",step:"SYSTEM_CLOCK_MULTIPLIER"}},{id:"animated-tower",name:"Animated Tower",position:{cartographicDegrees:[124.6,12.07,0]},orientation:{epoch:"2019-06-01T16:00:00Z"},model:{gltf:"/tower.glb",scale:.06,runAnimations:!0,heightReference:"CLAMP_TO_GROUND"}}];Cesium.Ion.defaultAccessToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMzI5ZTc1YS1jZjk3LTRiMzktYTQ2OS1jYWFmYjBmMDcwNWMiLCJpZCI6MTU0Nzc3LCJpYXQiOjE3MDgwNzQzMTJ9.2t_Vxijm0l-ldBfu9IFsgn3xU-R_fVwkz2eLZ4Wu-q4";const p=new Cesium.Viewer("cesiumContainer",{animation:!0,timeline:!1,fullscreenButton:!0,baseLayerPicker:!0}),me=Cesium.Rectangle.fromDegrees(116,-10,127,20);p.scene.screenSpaceCameraController.minimumZoomDistance=10;p.scene.screenSpaceCameraController.maximumZoomDistance=1e4;p.scene.screenSpaceCameraController.constrainedRectangle=me;const he=p.dataSources.add(Cesium.CzmlDataSource.load(le));he.then(function(t){p.trackedEntity=t.entities.getById("animated-tower"),p.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(124.6,12.07,30)});const e=p.clock;e.shouldAnimate=!1;const i=document.getElementById("windSlider"),r=document.getElementById("windValue");i.addEventListener("input",()=>{const a=Number(i.value);r.textContent=a,a>80?e.shouldAnimate=!0:e.shouldAnimate=!1})}).catch(function(t){console.error(t)});let v=null,P=new Cesium.Cartesian2(.05,0),_=.2,N=.2;function U(t){const e=`/wind_${t}.json`;fetch(e).then(i=>i.json()).then(i=>{v&&(v.destroy(),v=null);const r={...i,bounds:{west:i.bbox[0],south:i.bbox[1],east:i.bbox[2],north:i.bbox[3]}},a={domain:{min:0,max:8},speedFactor:_,lineWidth:{min:1,max:2},lineLength:{min:50,max:100},particleHeight:100,particlesTextureSize:200,flipY:!0,useViewerBounds:!0,dynamic:!0,colors:["#fff"]};console.log(a),v=new de(p,r,a),v.addEventListener("dataChange",o=>{console.log("Wind data updated:",o)}),v.addEventListener("optionsChange",o=>{console.log("Options updated:",o)})}).catch(i=>{console.error("Failed to load wind data:",i)})}U("east");G("east");const pe=document.getElementById("windDirection");pe.addEventListener("change",t=>{const e=t.target.value;U(e),G(e)});const fe=`
uniform sampler2D colorTexture;
uniform float time;
uniform vec2 windDir; // new: direction of tilt
in vec2 v_textureCoordinates;
uniform float rainSpeed; // now dynamic
float rand(vec2 co) {
   return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
}
void main(void) {
   vec4 color = texture(colorTexture, v_textureCoordinates);
   // Speed & density
   float speed = rainSpeed; // now dynamic 
   float density = 300.0;

   // If rain speed <= 0.25, show only background
  if (speed <= 0.25) {
      out_FragColor = color;
      return;
  }
   // UV animation
   vec2 uv = v_textureCoordinates;
   float fall = time * speed;

   // Apply tilt that grows as drop falls
    uv.x += windDir.x * fall * 0.1; // tilt horizontally with wind
    uv.y += fall + windDir.y * fall * 0.05; // mostly downward
 

   // Create vertical streaks
   float column = floor(uv.x * density);
   float offset = rand(vec2(column, 0.0));
   float yPos = fract(uv.y + offset);

   // Streak shape
   float drop = smoothstep(0.02, 0.0, yPos);
   float alpha = drop * 0.5;

   vec3 rainColor = vec3(0.7, 0.7, 0.7);
   vec3 finalColor = mix(color.rgb, rainColor, alpha);
   out_FragColor = vec4(finalColor, 1.0);
}
`,ve=new Cesium.PostProcessStage({fragmentShader:fe,uniforms:{time:()=>performance.now()/1e3%1e3,windDir:()=>P,rainSpeed:()=>N}});p.scene.postProcessStages.add(ve);function G(t){switch(t){case"east":P=new Cesium.Cartesian2(.5,0);break;case"west":P=new Cesium.Cartesian2(-.5,0);break;case"north":P=new Cesium.Cartesian2(0,-.5);break;case"south":P=new Cesium.Cartesian2(0,.5);break;default:P=new Cesium.Cartesian2(0,0)}}document.getElementById("windSlider").addEventListener("input",t=>{const e=parseInt(t.target.value,10);document.getElementById("windValue").textContent=e,_=e/200,v&&v.updateOptions({speedFactor:_})});document.getElementById("typhoonSlider").addEventListener("input",t=>{const e=parseInt(t.target.value,10);document.getElementById("typhoonValue").textContent=e,N=e/200});p.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(124.6,12.07,15e3)});let g={west:124.4,east:124.7,south:12.01,north:12.1},M=CesiumHeatmap.create(p,g,{maxOpacity:.6,minOpacity:.1,blur:.85}),k=[];for(let t=0;t<1e3;t++)k.push({x:g.west+Math.random()*(g.east-g.west),y:g.south+Math.random()*(g.north-g.south),value:Math.floor(Math.random()*100)});M.setWGS84Data(0,100,k);M._layer.show=!1;let V=M._layer;function xe(){V.show=!V.show}document.getElementById("toggleHeatmapBtn").addEventListener("click",xe);
