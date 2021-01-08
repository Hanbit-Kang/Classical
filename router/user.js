var express = require('express');
var router = express.Router();
var Account = require('../models/Account');
var Post = require('../models/Post');
var Comment = require('../models/Comment');
var bcrypt = require('bcryptjs');

router.get('/user/index/:id', async function(req, res){
  var IsErr = false;
  var ObjUser = await Account.findOne({id:req.params.id}, function(err, user){
    if(err) return res.json(err);
    if(!user){
      req.session.error={'msg':"아이디가 존재하지 않습니다."};
      res.redirect('/');
      IsErr = true;
    }
  });
  if(!IsErr){
    var postpage = Math.max(1, parseInt(req.query.postpage));
    var postlimit = 10;
    postpage = !isNaN(postpage)?postpage:1;

    var postskip = (postpage-1)*postlimit;
    var postcount = await Post.countDocuments({author:ObjUser});
    var postmaxPage = Math.ceil(postcount/postlimit);
    var posts;

    posts = await Post.aggregate([
      { $match: { author: ObjUser._id } },
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
    var commentcount = await Comment.countDocuments({author:ObjUser, isDeleted:false});
    var commentmaxPage = Math.ceil(commentcount/postlimit);
    var comments;

    comments = await Comment.aggregate([ //댓글 내용
      { $match: { author: ObjUser._id, isDeleted:false } },
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
          title:1
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
      user: ObjUser,
      postcount: postcount,
      commentcount: commentcount
    });
  }
});
//EDIT
router.get('/user/edit/:id', function(req, res){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    res.redirect('/');
  }else{
    var errors = req.flash('errors')[0] || {};
    Account.findOne({id:req.params.id}, function(err, user){
      if(err) return res.json(err);
      res.render('user/edit', {
        user: user,
        errors:errors
      });
    });
  }
});

router.post('/user/edit/:id', function(req, res, next){
  Account.findOne({nickname:req.body.nickname}, function(err, user){
    if(err) return res.json(err);
    else if(!user || req.body.nickname==user.nickname){
      Account.findOne({id:req.params.id})
        .exec(function(err, user){
          if(err) return res.json(err);
          for(var p in req.body) user[p] = req.body[p];

          user.save(function(err, user){
            if(err) return res.json(err);
            req.session.passport.user.nickname = user.nickname;
            res.redirect('/');
          });
        });
    }else{
      req.flash('errors', {nickname:'중복된 닉네임입니다.'});
      return res.redirect('/user/edit/'+user.id);
    }
  });
});
//change PW
router.get('/user/pw/:id', function(req, res){
  if(!(req.session.passport && req.session.passport.user.id==req.params.id)){
    req.session.error={'msg':"잘못된 접근입니다."};
    res.redirect('/');
  }else{
    var errors = req.flash('errors')[0] || {};
    Account.findOne({id:req.params.id}, function(err, user){
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
    res.redirect('/');
  }else{
    Account.findOne({id:req.params.id}, function(err, user){
      if(err) return res.json(err);
      else if(!user){
        req.session.error={'msg':"잘못된 접근입니다."};
        res.redirect('/');
      }

      if(!bcrypt.compareSync(req.body.curPassword, user.password)){
        req.flash('errors', {password:'비밀번호가 틀렸습니다.'});
        return res.redirect('/user/pw/'+user.id);
      }
      user.password = req.body.newPassword;
      user.save();
      res.redirect('/user/index/'+req.params.id);
    });
  }
});
module.exports = router;
