/*
    用连接池连接数据库
*/
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const cookie = require('cookie');

//用来读取cookie的
const cookieParser = require('cookie-parser');
//session 是基于 cookie生成的
const cookieSession = require('cookie-session');
const myselfSql = require('./mysql.js');


let server = new express();
server.use(bodyParser.urlencoded({}))
server.listen(8084);
server.use(cookieParser('secret'));
//因为session不是独立存在的，是基于cookie的，所以仍然需要解析cookie的工具
//session是必须加入签名的，如果没加签名的话，系统会报错，告诉你Error:.required for signed cookies
(function(){
        let arr = [];
        for(let i = 0;i<10000;i++){
            arr.push('keys_'+Math.random());
        }
        server.use(cookieSession({
            keys:arr,//设置session密钥
            name:'user'//加密的cookie的名字,存储的是一个session_id,最后通过这个来在服务端查找到对应的人
        }))
})();
let pool = mysql.createPool({
    //创建的最大连接数
    connectionLimit:10,
    //队列数量限制:在调用getConnection返回错误之前,连接池所允许入队列的最大请求数量
    queueLimit:1,
    //连接等待时间:当无连接可用或连接数达到上限的时候,判定连接池动作.如果为true,连接池将会请求加入队列,待可用之时再触发操作,如为false,连接池将立即返回错误(默认值:true)
    host:'localhost',
    user:'root',
    password:'191026',
    database:'weekly'
})
server.post('/weekly_war/user/register.do',function(req,res){
    console.log("注册:");
    console.log(req.body);
    let user = req.body;
    let data;
    // 注册成功需要满足以下条件
    // 1.用户名不能为空
    if(!user.email){
        data = {
            msg:"参数为空",
            code:1003,
            success:false
        };
        res.write(JSON.stringify(data));
        res.end();
    }else if(user.password.length<4||user.password.length>18){
     // 2.密码的长度符合要求
       data = {
                msg:"注册失败,密码长度不对!",
                code:1004,
                success:false
            };
            res.write(JSON.stringify(data));
            res.end();
    }else{
    // 3.用户名在数据库中不存在
    //在数据库中创建一个user表，保存注册的用户信息
    //当要新添入用户的时候，就查看user表，如果有相同的用户名，那么注册成功，否则注册失败。
    //直接使用连接池
    let addSql = "INSERT INTO user(user_id,user_email,user_password,user_phone) VALUES(0,?,?,?)";
    let addSqlParams = [user.email,user.password,user.phone];
    //增加成员
    pool.query(addSql,addSqlParams,function(err,result){
        if(err){
            if(err.code==='ER_DUP_ENTRY'){
                data = {
                    msg:"注册失败,用户名已存在",
                    code:4000,
                    success:false
                }
            }else{
                data = {
                    msg:"未知错误",
                    code:5000,
                    success:false
                }
            }
            res.write(JSON.stringify(data));
        }else{
            console.log(result);  
            data = {
                msg:"注册成功",
                code:2000,
                success:true,
                user:{
                    //id要从数据库中获取
                    "id":result.insertId,
                    "email":null,
                    "password":null,
                }
            }
            res.write(JSON.stringify(data));
            //注册成功,再终止数据库的连接
            // connection.end();
            // console.log('INSERT ID:',result.insertId);
        }
        res.end();
        });
        // connection.end();
    }
    //结束响应
});
server.post('/weekly_war/user/login.do',function(req,res){
    console.log("登录:");
    console.log(req.body);
    
    //当登陆的时候,调取数据库中user表的内容,如果表中的内容存在,那么说明这个用户已经注册过了,那么我们就验证用户输入的密码和数据库中的密码是否匹配,如果匹配的话,那么就让用户登录成功,并且给客户端设置一个cookie,否则用户登陆失败.
    let user = req.body;
    let data = {};
    if(user.email){
        //注意:如果要进行字符串比较,这里的user.email必须被双引号包住
        let searchSql = 'SELECT user_email,user_password,user_id FROM user WHERE user_email="'+user.email+'"';
        pool.query(searchSql,function(err,result){
            if(err){
                console.log(err);
                data = {
                    msg:"服务器错误",
                    code:5000,
                    success:false
                };
            }else{
                console.log('ok');
                //这里只能判断长度,不能用result!=[],因为数组也是对象,对象默认是不相等的
                if(result.length!=0){
                    //当不为空,说明用户存在
                    console.log(result);
                    if(result[0].user_password===user.password){
                        data = {
                            msg:"登陆成功",
                            code:2000,
                            success:true,
                            user:{
                                id:result[0].user_id,
                                userName:result[0].user_email
                            }
                        };
                        //给跳转之后的页面设置cookie
                        //登陆成功之后,设置cookie
                        console.log('正在设置cookie');
                        // req.secret = 'secret';
                        res.cookie('user',result[0].user_id,{
                            //因为path为绝对路径
                            //只有匹配到相应的path,才会设置上cookie
                            path:'/',//默认值为'/'
                            maxAge:30*24*3600*1000,
                            signed:true
                        }); 
                        if(typeof req.session['test'] == 'undefined'){    
                            req.session['test'] = 'xixi';        
                        }
                    }else{
                        data = {
                            msg:"账户或密码错误",
                            code:3000,
                            success:false
                        };
                    }
                }else{
                    //用户不存在
                    data = {
                        msg:"账户或密码错误",
                        code:3000,
                        success:false
                    };
                }
            }
            //同步和异步的回调分开写,异步的res.end()记得写在回调函数的最后面,以免造成write after end的错误
            res.write(JSON.stringify(data));
            res.end();
        });
    }else{
        data = {
            msg:"用户名为空",
            code:1004,
            success:false
        };
        res.write(JSON.stringify(data));
        res.end();
    }
})
//获取某用户三周(上,这,下)周报
server.get('/weekly_war/task/getTasks.do',function(req,res){
    console.log('快捷');
    console.log(req.session['test']);
    let data = {};
    // console.log(req.url);
    // console.log(req.query);
    //cookie是响应头的一部分，后台发送给前端之后，前端第二次发送请求的时候会自动带上
    //我们首先要看看cookie存不存在
    // console.log(req.cookies);
    // console.log(req.signedCookies);
    if(req.signedCookies){
        let cookie = req.signedCookies;
        if(cookie.user==req.query.userId){
            data={
                msg:"成功",
                code:2000,
                success:true
            }
        }else{
            data={
                msg:"失败",
                code:5000,
                success:false
            }
        }
    }else{
        data={
            msg:"失败",
            code:5000,
            success:false
        }
    }
    console.log(data);
    res.write(JSON.stringify(data));
    res.end();
})
//添加周报接口
server.get('/weekly_war/task/addTask.do',function(req,res){
    //在数据库中建一张表存储周报
    console.log('添加');
    console.log(req.query);
    let week = req.query;
    let insertSql = myselfSql.insert('content',['weekly_taskData','weekly_taskName','weekly_content','weekly_completeDegree','weekly_timeConsuming','weekly_id','user_id'],[week.taskDate,week.taskName,week.content,week.timeDegree,week.timeConsuming,0,week.timeId]);
    pool.query(insertSql,function(err,result){
        if(err){
            console.log(err);
            console.log(err.sqlState);
            if(err.sqlState==22007){
                data = {
                    msg:"日期的格式有问题",
                    code:1004,
                    success:false
                }
            }else{
                data = {
                    msg:"服务器错误",
                    code:5000,
                    success:false
                }
            }
        }else{
            data = {
                msg:"插入成功",
                code:2000,
                success:true,
            }
        }
        res.write(JSON.stringify(data));
        res.end();
    })
})
