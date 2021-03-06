var express = require('express');
var router = express.Router();
var Account = require('../models/Account');
var Post = require('../models/Post');
var Comment = require('../models/Comment');
var Auth = require('../models/Auth');
var Alert = require('../models/Alert');
var bcrypt = require('bcryptjs');
var Log = require('../models/Log');

router.get('/user/index/:id', function(req, res){
  if(req.params.id=='L'){
    req.session.error={'msg':"탈퇴한 회원입니다."};
    return res.redirect('back');
  }
  Account.findOne({id:req.params.id, isLeaved:false}, async function(err, user){
    if(err) return res.json(err);
    else if(!user){
      req.session.error={'msg':"아이디가 존재하지 않습니다."};
      return res.redirect('/');
    }else{
      var postpage = Math.max(1, parseInt(req.query.postpage));
      var postlimit = 10;
      postpage = !isNaN(postpage)?postpage:1;

      var postskip = (postpage-1)*postlimit;
      var postcount = await Post.countDocuments({author:user, isDeleted: false});
      var postmaxPage = Math.ceil(postcount/postlimit);
      var posts;

      posts = await Post.aggregate([
        { $match: { author: user._id, isDeleted: false } },
        { $lookup: {
          from: 'accounts',
          localField: 'author',
          foreignField: '_id',
          as: 'author'
        }},
        { $unwind: '$author'},
        { $sort: { createdAt: -1}},
        { $skip: postskip },
        { $limit: postlimit },
        { $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          as: 'comments'
        }},
        { $project:{
          title: 1,
          createdAt: 1,
          comment:1,
          category: 1,
          view: 1,
          like: 1
        }},
      ]).exec();

      var commentpage = Math.max(1, parseInt(req.query.commentpage));
      var commentlimit = 10;
      commentpage = !isNaN(commentpage)?commentpage:1;

      var commentskip = (commentpage-1)*postlimit;
      var commentcount = await Comment.countDocuments({author:user, isDeleted:false});
      var commentmaxPage = Math.ceil(commentcount/postlimit);
      var comments;

      comments = await Comment.aggregate([ //댓글 내용
        { $match: { author: user._id } },
        { $lookup: {
          from: 'posts',
          localField: 'post',
          foreignField: '_id',
          as: 'post'
        }},
        { $unwind: '$post'},
        { $sort: { createdAt: -1}},
        { $skip: commentskip },
        { $limit: postlimit },
        { $project:{
          post: {
            _id:1,
            category:1,
            title:1,
            isDeleted:1
          },
          text: 1,
          createdAt: 1
        }},
      ]).exec();

      res.render('user/index',{
        posts:posts,
        comments:comments,
        postcurrentPage:postpage,
        postmaxPage:postmaxPage,
        commentcurrentPage:commentpage,
        commentmaxPage:commentmaxPage,
        user: user,
        postcount: postcount,
        commentcount: commentcount
      });
    }
  });
});

//EDIT
router.get('/user/edit/:id', function(req, res){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    return res.redirect('/');
  }else{
    var errors = req.flash('errors')[0] || {};
    Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
      if(err) return res.json(err);
      res.render('user/edit', {
        user: user,
        errors:errors
      });
    });
  }
});

router.post('/user/edit/:id', function(req, res, next){
  Account.findOne({id:req.session.passport.user.id, nickname:req.body.nickname, isLeaved:false}, function(err, user){
    if(err) return res.json(err);
    if(!user || user.nickname==req.session.passport.user.nickname){
      Account.findOne({id:req.params.id})
        .exec(function(err, user){
          if(err) return res.json(err);
          for(var p in req.body) user[p] = req.body[p];

          user.save(function(err, user){
            if(err) return res.json(err);
            req.session.passport.user.nickname = req.body.nickname;
            req.session.success={'msg':"회원정보가 수정되었습니다."};
            Log.create({activity:'user edit'});
            res.redirect('/user/index/'+req.params.id);
          });
        });
    }else{
      req.flash('errors', {nickname:'중복된 닉네임입니다.'});
      return res.redirect('/user/edit/'+req.session.passport.user.id);
    }
  });
});

//change PW
router.get('/user/pw/:id', function(req, res){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    return res.redirect('/');
  }else{
    var errors = req.flash('errors')[0] || {};
    Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
      if(err) return res.json(err);
      res.render('user/pw', {
        user: user,
        errors:errors
      });
    });
  }
});

router.post('/user/pw/:id', function(req, res, next){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    return res.redirect('/');
  }else{
    Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
      if(err) return res.json(err);
      else if(!user){
        req.session.error={'msg':"잘못된 접근입니다."};
        return res.redirect('/');
      }

      if(!bcrypt.compareSync(req.body.curPassword, user.password)){
        req.flash('errors', {password:'비밀번호가 틀렸습니다.'});
        return res.redirect('/user/pw/'+user.id);
      }
      user.password = req.body.newPassword;
      user.save();
      req.session.success={'msg':"비밀번호가 변경되었습니다."};
      Log.create({activity:'user pw'});
      res.redirect('/user/index/'+req.params.id);
    });
  }
});

//find PW
router.get('/user/findpw/:id', function(req, res){
  var errors = req.flash('errors')[0] || {};
  Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
    if(err) return res.json(err);
    if(!user){
      req.session.error={'msg':"잘못된 접근입니다."};
      return res.redirect('/');
    }
    res.render('user/findpw', {
      user: user,
      errors:errors
    });
  });
});

router.post('/user/findpw/:id', function(req, res, next){
  Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
    if(err) return res.json(err);
    else if(!user){
      req.session.error={'msg':"잘못된 접근입니다."};
      return res.redirect('/');
    }
    Auth.findOne({code:req.body.code}, function(err, auth){
      if(err) return res.json(err);
      if(!auth){
        req.flash('errors', {code:'코드가 일치하지 않습니다.'});
        return res.redirect('/user/findpw/'+user.id);
      }

      let expireTime = auth.createdAt;
      expireTime.setSeconds(expireTime.getSeconds()+auth.ttl);
      if(Date.now()>Number(expireTime)){
        req.flash('errors', {code:'코드의 유효시간이 만료되었습니다.'});
        return res.redirect('/user/findpw/'+user.id);
      }

      user.password = req.body.newPassword;
      user.save();
      req.session.success={'msg':"비밀번호가 변경되었습니다."};
      Log.create({activity:'user findpw'});
      res.redirect('/login');
    });
  });
});

//leave
router.get('/user/leave/:id', function(req, res){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    return res.redirect('/');
  }else{
    var errors = req.flash('errors')[0] || {};
    Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
      if(err) return res.json(err);
      res.render('user/leave', {user: user});
    });
  }
});

router.post('/user/leave/:id', function(req, res, next){
  Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
    if(err) return res.json(err);
    if(!user||user.id!=req.session.passport.user.id){
      req.session.error={'msg':"잘못된 접근입니다."};
      return res.redirect('/');
    }
    let DATENOW = Date.now();
    user.leavedAt = DATENOW;
    user.nickname=String(DATENOW)+user.nickname;
    user.id=String(DATENOW)+user.id;
    user.email=String(DATENOW)+user.email;
    user.isLeaved = true;
    user.save();
    req.session.passport=null;
    req.logout();
    req.session.success={'msg':"탈퇴하였습니다."};
    Log.create({activity:'user leave'});
    res.redirect('/');
  });
});

router.get('/user/suspend/:id', function(req, res){
  Account.findOne({id:req.params.id, isLeaved:false}, function(err, user){
    if(err) return res.json(err);
    if(!(req.session.passport&&req.session.passport.user.level>=1)){
      req.session.error={'msg':"권한이 없습니다."};
      return res.redirect('/');
    }
    let resumeAt = new Date();
    resumeAt.setDate(resumeAt.getDate()+Number(req.query.date));
    user.resumeAt = resumeAt;
    user.isSuspended = true;
    user.save();
    req.session.success={'msg':"활동 정지하였습니다."};
    Alert.create({text:req.query.date+'일 동안 활동 정지 상태입니다. 사유는 다음과 같습니다. ['+req.query.reason+']', to:user._id});
    Log.create({activity:'ADMIN, user suspend:'+req.session.passport.user.id+'->'+user.id+' date:'+req.query.date});
    res.redirect('back');
  });
});

module.exports = router;
