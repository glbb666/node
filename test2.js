var fs = require('fs');
var out =  fs.createWriteStream('./message1.txt');
process.stdin.on('data',function(data){
    out.write(data)
})
process.stdin.on('end',function(data){
    process.exit();
})