'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _https = require('https');

var _https2 = _interopRequireDefault(_https);

var _s3 = require('s3');

var _s32 = _interopRequireDefault(_s3);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _progress = require('progress');

var _progress2 = _interopRequireDefault(_progress);

var _cdnizer = require('cdnizer');

var _cdnizer2 = _interopRequireDefault(_cdnizer);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

_http2['default'].globalAgent.maxSockets = _https2['default'].globalAgent.maxSockets = 50;

var DEFAULT_UPLOAD_OPTIONS = {
  ACL: 'public-read'
};

var DEFAULT_S3_OPTIONS = {
  region: 'us-west-2'
};

var S3Plugin = (function () {
  function S3Plugin() {
    var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, S3Plugin);

    var _options$s3Options = options.s3Options;
    var s3Options = _options$s3Options === undefined ? {} : _options$s3Options;
    var _options$s3UploadOptions = options.s3UploadOptions;
    var s3UploadOptions = _options$s3UploadOptions === undefined ? {} : _options$s3UploadOptions;
    var directory = options.directory;
    var include = options.include;
    var exclude = options.exclude;
    var basePath = options.basePath;
    var cdnizerOptions = options.cdnizerOptions;
    var htmlFiles = options.htmlFiles;

    this.requiredS3Opts = ['accessKeyId', 'secretAccessKey'];
    this.requiredS3UpOpts = ['Bucket'];
    this.uploadOptions = s3UploadOptions;
    this.isConnected = false;
    this.cdnizerOptions = cdnizerOptions;
    this.urlMappings = [];
    this.uploadTotal = 0;
    this.uploadProgress = 0;

    this.options = {
      directory: directory,
      include: include,
      exclude: exclude,
      htmlFiles: typeof htmlFiles === 'string' ? [htmlFiles] : htmlFiles
    };

    this.clientConfig = {
      maxAsyncS3: 50,
      s3Options: _lodash2['default'].merge(s3Options, DEFAULT_S3_OPTIONS)
    };

    if (!this.cdnizerOptions.files) this.cdnizerOptions.files = [];

    if (!this.cdnizerOptions) this.noCdnizer = true;
  }

  _createClass(S3Plugin, [{
    key: 'apply',
    value: function apply(compiler) {
      var _this = this;

      var hasRequiredOptions = this.requiredS3Opts.every(function (type) {
        return _this.clientConfig.s3Options[type];
      });

      var hasRequiredUploadOpts = this.requiredS3UpOpts.every(function (type) {
        return _this.uploadOptions[type];
      });

      // Set directory to output dir or custom
      this.options.directory = this.options.directory || compiler.options.output.path || compiler.options.output.context || '.';

      compiler.plugin('after-emit', function (compilation, cb) {
        if (!hasRequiredOptions) {
          compilation.errors.push(new Error('S3Plugin: Must provide ' + _this.requiredS3Opts.join(' and ')));
          cb();
        }

        if (!_this.requiredS3UpOpts) {
          compilation.errors.push(new Error('S3Plugin-RequiredS3UploadOpts: ' + _this.requiredS3UpOpts.join(' and ')));
          cb();
        }

        _fs2['default'].readdir(_this.options.directory, function (error, files) {
          if (error) {
            compilation.errors.push(new Error('S3Plugin-ReadOutputDir: ' + error));
            cb();
          } else {
            _this.uploadFiles(_this.filterAllowedFiles(files)).then(_this.changeHtmlUrls.bind(_this)).then(function () {
              console.log('Finished Uploading to S3');
              cb();
            })['catch'](function (e) {
              compilation.errors.push(new Error('S3Plugin: ' + e));
              cb();
            });
          }
        });
      });
    }
  }, {
    key: 'cdnizeHtml',
    value: function cdnizeHtml(htmlPath) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        _fs2['default'].readFile(htmlPath, function (err, data) {
          if (err) return reject(err);

          _fs2['default'].writeFile(htmlPath, _this2.cdnizer(data.toString()), function (err) {
            if (err) return reject(err);

            resolve();
          });
        });
      });
    }
  }, {
    key: 'changeHtmlUrls',
    value: function changeHtmlUrls() {
      var _this3 = this;

      if (this.noCdnizer) return Promise.resolve();

      var _options = this.options;
      var directory = _options.directory;
      var htmlFiles = _options.htmlFiles;

      var allHtml = (htmlFiles || _fs2['default'].readdirSync(directory).filter(function (file) {
        return /\.html$/.test(file);
      })).map(function (file) {
        return _path2['default'].resolve(directory, file);
      });

      this.cdnizer = (0, _cdnizer2['default'])(this.cdnizerOptions);

      return Promise.all(allHtml.map(function (file) {
        return _this3.cdnizeHtml(file);
      }));
    }
  }, {
    key: 'filterAllowedFiles',
    value: function filterAllowedFiles(files) {
      var _this4 = this;

      return files.reduce(function (res, file) {
        if (_this4.isIncludeOrExclude(file)) res.push({
          name: file,
          path: _path2['default'].resolve(_this4.options.directory, file)
        });

        return res;
      }, []);
    }
  }, {
    key: 'isIncludeOrExclude',
    value: function isIncludeOrExclude(file) {
      var isExclude;
      var isInclude;
      var _options2 = this.options;
      var include = _options2.include;
      var exclude = _options2.exclude;

      if (!include) isInclude = true;else isInclude = include.test(file);

      if (!exclude) isExclude = false;else isExclude = exclude.test(file);

      return isInclude && !isExclude;
    }
  }, {
    key: 'connect',
    value: function connect() {
      if (this.isConnected) return;

      this.client = _s32['default'].createClient(this.clientConfig);
      this.isConnected = true;
    }
  }, {
    key: 'uploadFiles',
    value: function uploadFiles() {
      var _this5 = this;

      var files = arguments.length <= 0 || arguments[0] === undefined ? [] : arguments[0];

      return Promise.all(files.map(function (file) {
        return _this5.uploadFile(file.name, file.path);
      }));
    }
  }, {
    key: 'uploadFile',
    value: function uploadFile(fileName, file) {
      var upload,
          s3Params = _lodash2['default'].merge({ Key: fileName }, this.uploadOptions, DEFAULT_UPLOAD_OPTIONS);

      // Remove Gzip from encoding if ico
      if (/\.ico/.test(fileName) && s3Params.ContentEncoding === 'gzip') delete s3Params.ContentEncoding;

      this.connect();
      upload = this.client.uploadFile({
        localFile: file,
        s3Params: s3Params
      });

      //var progressBar = new ProgressBar('Uploading [:bar] :percent :etas', {
      //complete: '>',
      //incomplete: '-',
      //total: 100
      //})

      this.cdnizerOptions.files.push(fileName);
      this.cdnizerOptions.files.push(fileName + '*');

      console.log('Uploading ', fileName);
      return new Promise(function (resolve, reject) {
        upload.on('error', reject);

        upload.on('progress', function () {
          var progress = (upload.progressAmount / upload.progressTotal).toFixed(2)

          //progressBar.update(progress)
          ;
        });

        upload.on('end', function () {
          return resolve(file);
        });
      });
    }
  }]);

  return S3Plugin;
})();

exports['default'] = S3Plugin;
module.exports = exports['default'];

