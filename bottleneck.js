(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var Bottleneck, DLList, Local, MIDDLE_PRIORITY, NUM_PRIORITIES, Sync, parser,
    slice = [].slice;

  NUM_PRIORITIES = 10;

  MIDDLE_PRIORITY = 5;

  parser = require("./parser");

  Local = require("./Local");

  DLList = require("./DLList");

  Sync = require("./Sync");

  Bottleneck = (function() {
    class Bottleneck {
      constructor(options = {}, ...invalid) {
        this.ready = this.ready.bind(this);
        this.chain = this.chain.bind(this);
        this.queued = this.queued.bind(this);
        this.running = this.running.bind(this);
        this.check = this.check.bind(this);
        this._drainOne = this._drainOne.bind(this);
        this.submit = this.submit.bind(this);
        this.schedule = this.schedule.bind(this);
        this.wrap = this.wrap.bind(this);
        this.updateSettings = this.updateSettings.bind(this);
        this.currentReservoir = this.currentReservoir.bind(this);
        this.incrementReservoir = this.incrementReservoir.bind(this);
        this.on = this.on.bind(this);
        this.once = this.once.bind(this);
        this.removeAllListeners = this.removeAllListeners.bind(this);
        this.stopAll = this.stopAll.bind(this);
        if (!((options != null) && typeof options === "object" && invalid.length === 0)) {
          throw new Bottleneck.prototype.BottleneckError("Bottleneck v2 takes a single object argument. Refer to https://github.com/SGrondin/bottleneck#upgrading-from-v1 if you're upgrading from Bottleneck v1.");
        }
        parser.load(options, this.instanceDefaults, this);
        this._queues = this._makeQueues();
        this._executing = {};
        this._nextIndex = 0;
        this._limiter = null;
        this._events = {};
        this._submitLock = new Sync("submit");
        this._registerLock = new Sync("register");
        this._store = new Local(parser.load(options, this.storeDefaults, {}));
      }

      ready() {
        return this._store._ready;
      }

      _addListener(name, status, cb) {
        var base;
        if ((base = this._events)[name] == null) {
          base[name] = [];
        }
        this._events[name].push({cb, status});
        return this;
      }

      _trigger(name, args) {
        if (name !== "debug") {
          this._trigger("debug", [`Event triggered: ${name}`, args]);
        }
        if (name === "dropped" && this.rejectOnDrop) {
          args.forEach(function(job) {
            return job.cb.apply({}, [new Bottleneck.prototype.BottleneckError("This job has been dropped by Bottleneck")]);
          });
        }
        if (this._events[name] == null) {
          return;
        }
        this._events[name] = this._events[name].filter(function(listener) {
          return listener.status !== "none";
        });
        return this._events[name].forEach(function(listener) {
          if (listener.status === "none") {
            return;
          }
          if (listener.status === "once") {
            listener.status = "none";
          }
          return listener.cb.apply({}, args);
        });
      }

      _makeQueues() {
        var i, j, ref, results;
        results = [];
        for (i = j = 1, ref = NUM_PRIORITIES; 1 <= ref ? j <= ref : j >= ref; i = 1 <= ref ? ++j : --j) {
          results.push(new DLList());
        }
        return results;
      }

      chain(_limiter) {
        this._limiter = _limiter;
        return this;
      }

      _sanitizePriority(priority) {
        var sProperty;
        sProperty = ~~priority !== priority ? MIDDLE_PRIORITY : priority;
        if (sProperty < 0) {
          return 0;
        } else if (sProperty > NUM_PRIORITIES - 1) {
          return NUM_PRIORITIES - 1;
        } else {
          return sProperty;
        }
      }

      _find(arr, fn) {
        var ref;
        return (ref = (function() {
          var i, j, len, x;
          for (i = j = 0, len = arr.length; j < len; i = ++j) {
            x = arr[i];
            if (fn(x)) {
              return x;
            }
          }
        })()) != null ? ref : [];
      }

      queued(priority) {
        if (priority != null) {
          return this._queues[priority].length;
        } else {
          return this._queues.reduce((function(a, b) {
            return a + b.length;
          }), 0);
        }
      }

      running() {
        return this._store.__running__();
      }

      _getFirst(arr) {
        return this._find(arr, function(x) {
          return x.length > 0;
        });
      }

      check(weight = 1) {
        return this._store.__check__(weight);
      }

      _run(next, wait) {
        var done, index;
        this._trigger("debug", [
          `Scheduling ${next.options.id}`,
          {
            args: next.args,
            options: next.options
          }
        ]);
        done = false;
        index = this._nextIndex++;
        return this._executing[index] = {
          timeout: setTimeout(() => {
            var completed;
            this._trigger("debug", [
              `Executing ${next.options.id}`,
              {
                args: next.args,
                options: next.options
              }
            ]);
            completed = async(...args) => {
              var ref, running;
              if (!done) {
                done = true;
                delete this._executing[index];
                this._trigger("debug", [
                  `Completed ${next.options.id}`,
                  {
                    args: next.args,
                    options: next.options
                  }
                ]);
                ({running} = (await this._store.__free__(next.options.weight)));
                this._drainAll();
                if (running === 0 && this.queued() === 0) {
                  this._trigger("idle", []);
                }
                if (!this.interrupt) {
                  return (ref = next.cb) != null ? ref.apply({}, args) : void 0;
                }
              }
            };
            if (this._limiter != null) {
              return this._limiter.submit.apply(this._limiter, Array.prototype.concat(next.task, next.args, completed));
            } else {
              return next.task.apply({}, next.args.concat(completed));
            }
          }, wait),
          job: next
        };
      }

      _drainOne() {
        return this._registerLock.schedule(() => {
          var args, options, queue, queued;
          if ((queued = this.queued()) === 0) {
            return Promise.resolve(false);
          }
          queue = this._getFirst(this._queues);
          ({options, args} = queue.first());
          this._trigger("debug", [`Draining ${options.id}`, {args, options}]);
          return this._store.__register__(options.weight).then(({success, wait}) => {
            var next;
            this._trigger("debug", [`Drained ${options.id}`, {success, args, options}]);
            if (success) {
              next = queue.shift();
              if (this.queued() === 0 && this._submitLock._queue.length === 0) {
                this._trigger("empty", []);
              }
              this._run(next, wait);
            }
            return Promise.resolve(success);
          });
        });
      }

      _drainAll() {
        return this._drainOne().then((success) => {
          if (success) {
            return this._drainAll();
          } else {
            return Promise.resolve(success);
          }
        }).catch((e) => {
          return this._trigger("error", [e]);
        });
      }

      submit(...args) {
        var cb, j, job, l, options, ref, ref1, task;
        if (typeof args[0] === "function") {
          ref = args, task = ref[0], args = 3 <= ref.length ? slice.call(ref, 1, j = ref.length - 1) : (j = 1, []), cb = ref[j++];
          options = this.jobDefaults;
        } else {
          ref1 = args, options = ref1[0], task = ref1[1], args = 4 <= ref1.length ? slice.call(ref1, 2, l = ref1.length - 1) : (l = 2, []), cb = ref1[l++];
          options = parser.load(options, this.jobDefaults);
        }
        job = {options, task, args, cb};
        options.priority = this._sanitizePriority(options.priority);
        this._trigger("debug", [`Queueing ${options.id}`, {args, options}]);
        return this._submitLock.schedule(async() => {
          var blocked, e, reachedHWM, shifted, strategy;
          try {
            ({reachedHWM, blocked, strategy} = (await this._store.__submit__(this.queued(), options.weight)));
            this._trigger("debug", [`Queued ${options.id}`, {args, options, reachedHWM, blocked}]);
          } catch (error) {
            e = error;
            this._trigger("debug", [
              `Could not queue ${options.id}`,
              {
                args,
                options,
                error: e
              }
            ]);
            job.cb(e);
            return false;
          }
          if (blocked) {
            this._queues = this._makeQueues();
            this._trigger("dropped", [job]);
            return true;
          } else if (reachedHWM) {
            shifted = strategy === Bottleneck.prototype.strategy.LEAK ? this._getFirst(this._queues.slice(options.priority).reverse()).shift() : strategy === Bottleneck.prototype.strategy.OVERFLOW_PRIORITY ? this._getFirst(this._queues.slice(options.priority + 1).reverse()).shift() : strategy === Bottleneck.prototype.strategy.OVERFLOW ? job : void 0;
            if (shifted != null) {
              this._trigger("dropped", [shifted]);
            }
            if ((shifted == null) || strategy === Bottleneck.prototype.strategy.OVERFLOW) {
              return reachedHWM;
            }
          }
          this._queues[options.priority].push(job);
          await this._drainAll();
          return reachedHWM;
        });
      }

      schedule(...args) {
        var options, task, wrapped;
        if (typeof args[0] === "function") {
          [task, ...args] = args;
          options = this.jobDefaults;
        } else {
          [options, task, ...args] = args;
          options = parser.load(options, this.jobDefaults);
        }
        wrapped = function(...args) {
          var cb, j, ref;
          ref = args, args = 2 <= ref.length ? slice.call(ref, 0, j = ref.length - 1) : (j = 0, []), cb = ref[j++];
          return (task.apply({}, args)).then(function(...args) {
            return cb.apply({}, Array.prototype.concat(null, args));
          }).catch(function(...args) {
            return cb.apply({}, args);
          });
        };
        return new this.Promise((resolve, reject) => {
          return this.submit.apply({}, Array.prototype.concat(options, wrapped, args, function(...args) {
            return (args[0] != null ? reject : (args.shift(), resolve)).apply({}, args);
          })).catch(function(e) {
            return this._trigger("error", [e]);
          });
        });
      }

      wrap(fn) {
        return (...args) => {
          return this.schedule.apply({}, Array.prototype.concat(fn, args));
        };
      }

      async updateSettings(options = {}) {
        await this._store.__updateSettings__(parser.overwrite(options, this.storeDefaults));
        parser.overwrite(options, this.instanceDefaults, this);
        this._drainAll();
        return this;
      }

      currentReservoir() {
        return this._store.__currentReservoir__();
      }

      async incrementReservoir(incr = 0) {
        await this._store.__incrementReservoir__(incr);
        this._drainAll();
        return this;
      }

      on(name, cb) {
        return this._addListener(name, "many", cb);
      }

      once(name, cb) {
        return this._addListener(name, "once", cb);
      }

      removeAllListeners(name = null) {
        if (name != null) {
          delete this._events[name];
        } else {
          this._events = {};
        }
        return this;
      }

      stopAll(interrupt = this.interrupt) {
        var job, k, keys;
        this.interrupt = interrupt;
        keys = Object.keys(this._executing);
        (function() {
          var j, len, results;
          results = [];
          for (j = 0, len = keys.length; j < len; j++) {
            k = keys[j];
            results.push(clearTimeout(this._executing[k].timeout));
          }
          return results;
        }).call(this);
        this._drainOne = function() {};
        this._drainAll = function() {};
        this.check = function() {
          return false;
        };
        this.submit = function(...args) {
          var cb, j, ref;
          ref = args, args = 2 <= ref.length ? slice.call(ref, 0, j = ref.length - 1) : (j = 0, []), cb = ref[j++];
          return cb(new Bottleneck.prototype.BottleneckError("This limiter is stopped"));
        };
        this.schedule = function() {
          return this.Promise.reject(new Bottleneck.prototype.BottleneckError("This limiter is stopped"));
        };
        if (this.interrupt) {
          (function() {
            var j, len, results;
            results = [];
            for (j = 0, len = keys.length; j < len; j++) {
              k = keys[j];
              results.push(this._trigger("dropped", [this._executing[k].job]));
            }
            return results;
          }).call(this);
        }
        while (job = this._getFirst(this._queues).shift()) {
          this._trigger("dropped", [job]);
        }
        this._trigger("empty", []);
        if (this.running() === 0) {
          this._trigger("idle", []);
        }
        return this;
      }

    };

    Bottleneck.default = Bottleneck;

    Bottleneck.strategy = Bottleneck.prototype.strategy = {
      LEAK: 1,
      OVERFLOW: 2,
      OVERFLOW_PRIORITY: 4,
      BLOCK: 3
    };

    Bottleneck.BottleneckError = Bottleneck.prototype.BottleneckError = require("./BottleneckError");

    Bottleneck.Cluster = Bottleneck.prototype.Cluster = require("./Cluster");

    Bottleneck.prototype.jobDefaults = {
      priority: MIDDLE_PRIORITY,
      weight: 1,
      id: "<no-id>"
    };

    Bottleneck.prototype.storeDefaults = {
      maxConcurrent: null,
      minTime: 0,
      highWater: null,
      strategy: Bottleneck.prototype.strategy.LEAK,
      penalty: null,
      reservoir: null,
      Promise: Promise
    };

    Bottleneck.prototype.instanceDefaults = {
      rejectOnDrop: true,
      interrupt: false,
      Promise: Promise
    };

    return Bottleneck;

  })();

  module.exports = Bottleneck;

}).call(this);

},{"./BottleneckError":2,"./Cluster":3,"./DLList":4,"./Local":5,"./Sync":6,"./parser":8}],2:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var BottleneckError;

  BottleneckError = class BottleneckError extends Error {};

  module.exports = BottleneckError;

}).call(this);

},{}],3:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var Cluster, parser,
    hasProp = {}.hasOwnProperty;

  parser = require("./parser");

  Cluster = (function() {
    class Cluster {
      constructor(limiterOptions = {}, clusterOptions = {}) {
        this.limiterOptions = limiterOptions;
        parser.load(clusterOptions, this.defaults, this);
        this.limiters = {};
        this.Bottleneck = require("./Bottleneck");
        this.startAutoCleanup();
      }

      key(key = "") {
        var ref;
        return (ref = this.limiters[key]) != null ? ref : (this.limiters[key] = new this.Bottleneck(this.limiterOptions));
      }

      deleteKey(key = "") {
        return delete this.limiters[key];
      }

      all(cb) {
        var k, ref, results, v;
        ref = this.limiters;
        results = [];
        for (k in ref) {
          if (!hasProp.call(ref, k)) continue;
          v = ref[k];
          results.push(cb(v));
        }
        return results;
      }

      keys() {
        return Object.keys(this.limiters);
      }

      startAutoCleanup() {
        var base;
        this.stopAutoCleanup();
        return typeof (base = (this.interval = setInterval(() => {
          var k, ref, results, time, v;
          time = Date.now();
          ref = this.limiters;
          results = [];
          for (k in ref) {
            v = ref[k];
            if ((v._nextRequest + this.timeout) < time) {
              results.push(this.deleteKey(k));
            } else {
              results.push(void 0);
            }
          }
          return results;
        }, this.timeout / 10))).unref === "function" ? base.unref() : void 0;
      }

      stopAutoCleanup() {
        return clearInterval(this.interval);
      }

      updateSettings(options = {}) {
        parser.overwrite(options, this.defaults, this);
        if (options.timeout != null) {
          return this.startAutoCleanup();
        }
      }

    };

    Cluster.prototype.defaults = {
      timeout: 1000 * 60 * 5
    };

    return Cluster;

  })();

  module.exports = Cluster;

}).call(this);

},{"./Bottleneck":1,"./parser":8}],4:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var DLList;

  DLList = class DLList {
    constructor() {
      this._first = null;
      this._last = null;
      this.length = 0;
    }

    push(value) {
      var node;
      this.length++;
      node = {
        value,
        next: null
      };
      if (this._last != null) {
        this._last.next = node;
        this._last = node;
      } else {
        this._first = this._last = node;
      }
      return void 0;
    }

    shift() {
      var ref1, value;
      if (this._first == null) {
        return void 0;
      } else {
        this.length--;
      }
      value = this._first.value;
      this._first = (ref1 = this._first.next) != null ? ref1 : (this._last = null);
      return value;
    }

    first() {
      if (this._first != null) {
        return this._first.value;
      }
    }

    getArray() {
      var node, ref, results;
      node = this._first;
      results = [];
      while (node != null) {
        results.push((ref = node, node = node.next, ref.value));
      }
      return results;
    }

  };

  module.exports = DLList;

}).call(this);

},{}],5:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var BottleneckError, DLList, Local, parser;

  parser = require("./parser");

  DLList = require("./DLList");

  BottleneckError = require("./BottleneckError");

  Local = class Local {
    constructor(options) {
      parser.load(options, options, this);
      this._nextRequest = Date.now();
      this._running = 0;
      this._unblockTime = 0;
      this._ready = this.yieldLoop();
    }

    yieldLoop(t = 0) {
      return new this.Promise(function(resolve, reject) {
        return setTimeout(resolve, t);
      });
    }

    computePenalty() {
      var ref;
      return (ref = this.penalty) != null ? ref : (15 * this.minTime) || 5000;
    }

    async __updateSettings__(options) {
      await this.yieldLoop();
      parser.overwrite(options, options, this);
      return true;
    }

    async __running__() {
      await this.yieldLoop();
      return this._running;
    }

    conditionsCheck(weight) {
      return ((this.maxConcurrent == null) || this._running + weight <= this.maxConcurrent) && ((this.reservoir == null) || this.reservoir - weight >= 0);
    }

    async __incrementReservoir__(incr) {
      await this.yieldLoop();
      return this.reservoir += incr;
    }

    async __currentReservoir__() {
      await this.yieldLoop();
      return this.reservoir;
    }

    isBlocked(now) {
      return this._unblockTime >= now;
    }

    check(weight, now) {
      return this.conditionsCheck(weight) && (this._nextRequest - now) <= 0;
    }

    async __check__(weight) {
      var now;
      await this.yieldLoop();
      now = Date.now();
      return this.check(weight, now);
    }

    async __register__(weight) {
      var now, wait;
      await this.yieldLoop();
      now = Date.now();
      if (this.conditionsCheck(weight)) {
        this._running += weight;
        if (this.reservoir != null) {
          this.reservoir -= weight;
        }
        wait = Math.max(this._nextRequest - now, 0);
        this._nextRequest = now + wait + this.minTime;
        return {
          success: true,
          wait
        };
      } else {
        return {
          success: false
        };
      }
    }

    strategyIsBlock() {
      return this.strategy === 3;
    }

    async __submit__(queueLength, weight) {
      var blocked, now, reachedHWM;
      await this.yieldLoop();
      if ((this.maxConcurrent != null) && weight > this.maxConcurrent) {
        throw new BottleneckError(`Impossible to add a job having a weight of ${weight} to a limiter having a maxConcurrent setting of ${this.maxConcurrent}`);
      }
      now = Date.now();
      reachedHWM = (this.highWater != null) && queueLength === this.highWater && !this.check(weight, now);
      blocked = this.strategyIsBlock() && (reachedHWM || this.isBlocked(now));
      if (blocked) {
        this._unblockTime = now + this.computePenalty();
        this._nextRequest = this._unblockTime + this.minTime;
      }
      return {
        reachedHWM,
        blocked,
        strategy: this.strategy
      };
    }

    async __free__(weight) {
      await this.yieldLoop();
      this._running -= weight;
      return {
        running: this._running
      };
    }

  };

  module.exports = Local;

}).call(this);

},{"./BottleneckError":2,"./DLList":4,"./parser":8}],6:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  var BottleneckError, DLList, Sync,
    slice = [].slice;

  DLList = require("./DLList");

  BottleneckError = require("./BottleneckError");

  Sync = class Sync {
    constructor(name) {
      this.submit = this.submit.bind(this);
      this.schedule = this.schedule.bind(this);
      this.wrap = this.wrap.bind(this);
      this.name = name;
      this._running = 0;
      this._queue = new DLList();
    }

    _tryToRun() {
      var next;
      if ((this._running < 1) && this._queue.length > 0) {
        this._running++;
        next = this._queue.shift();
        return next.task.apply({}, next.args.concat((...args) => {
          var ref;
          this._running--;
          this._tryToRun();
          return (ref = next.cb) != null ? ref.apply({}, args) : void 0;
        }));
      }
    }

    submit(task, ...args) {
      var cb, i, ref;
      ref = args, args = 2 <= ref.length ? slice.call(ref, 0, i = ref.length - 1) : (i = 0, []), cb = ref[i++];
      this._queue.push({task, args, cb});
      return this._tryToRun();
    }

    schedule(task, ...args) {
      var wrapped;
      wrapped = function(...args) {
        var cb, i, ref;
        ref = args, args = 2 <= ref.length ? slice.call(ref, 0, i = ref.length - 1) : (i = 0, []), cb = ref[i++];
        return (task.apply({}, args)).then(function(...args) {
          return cb.apply({}, Array.prototype.concat(null, args));
        }).catch(function(...args) {
          return cb.apply({}, args);
        });
      };
      return new Promise((resolve, reject) => {
        return this.submit.apply({}, Array.prototype.concat(wrapped, args, function(...args) {
          return (args[0] != null ? reject : (args.shift(), resolve)).apply({}, args);
        }));
      });
    }

    wrap(fn) {
      return (...args) => {
        return this.schedule.apply({}, Array.prototype.concat(fn, args));
      };
    }

  };

  module.exports = Sync;

}).call(this);

},{"./BottleneckError":2,"./DLList":4}],7:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  module.exports = require("./Bottleneck");

}).call(this);

},{"./Bottleneck":1}],8:[function(require,module,exports){
// Generated by CoffeeScript 2.0.2
(function() {
  exports.load = function(received, defaults, onto = {}) {
    var k, ref, v;
    for (k in defaults) {
      v = defaults[k];
      onto[k] = (ref = received[k]) != null ? ref : v;
    }
    return onto;
  };

  exports.overwrite = function(received, defaults, onto = {}) {
    var k, v;
    for (k in received) {
      v = received[k];
      if (defaults[k] !== void 0) {
        onto[k] = v;
      }
    }
    return onto;
  };

}).call(this);

},{}]},{},[7]);
