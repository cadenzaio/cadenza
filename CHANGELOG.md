## [3.0.16](https://github.com/cadenzaio/cadenza/compare/v3.0.15...v3.0.16) (2025-09-22)


### Bug Fixes

* Fixed graph done emission. ([1102c81](https://github.com/cadenzaio/cadenza/commit/1102c819ceb73e4e797d91c588fac21c3c5b5ad2))

## [3.0.15](https://github.com/cadenzaio/cadenza/compare/v3.0.14...v3.0.15) (2025-09-22)


### Bug Fixes

* Fixed issues with some node metrics emissions. ([38eb553](https://github.com/cadenzaio/cadenza/commit/38eb553ab329cba5eb5dd698e2857615f915863f))

## [3.0.14](https://github.com/cadenzaio/cadenza/compare/v3.0.13...v3.0.14) (2025-09-20)


### Bug Fixes

* Added graph completed signal for delegation resolution. ([045ec55](https://github.com/cadenzaio/cadenza/commit/045ec55b3e3bc7bcf7337b1a6ec08ae7a48ea3d7))

## [3.0.13](https://github.com/cadenzaio/cadenza/compare/v3.0.12...v3.0.13) (2025-09-20)


### Bug Fixes

* Fixed issue with passing real instances in a context object. ([d48d7a5](https://github.com/cadenzaio/cadenza/commit/d48d7a5f13e2c47d51d37568154f1f4bc7c58072))

## [3.0.12](https://github.com/cadenzaio/cadenza/compare/v3.0.11...v3.0.12) (2025-09-20)


### Bug Fixes

* More debugging ([49a478b](https://github.com/cadenzaio/cadenza/commit/49a478b21de5fcb4caee10648511fd2fddb346d7))

## [3.0.11](https://github.com/cadenzaio/cadenza/compare/v3.0.10...v3.0.11) (2025-09-20)


### Bug Fixes

* Debugging ([be98bd0](https://github.com/cadenzaio/cadenza/commit/be98bd0fdd619df926ca2be2470e8d6e210ada2c))

## [3.0.10](https://github.com/cadenzaio/cadenza/compare/v3.0.9...v3.0.10) (2025-09-19)


### Bug Fixes

* Fixed bug getting tasks and routines. ([e43842b](https://github.com/cadenzaio/cadenza/commit/e43842b3cf40a975abf0af2da3375bdb33be12c8))

## [3.0.9](https://github.com/cadenzaio/cadenza/compare/v3.0.8...v3.0.9) (2025-09-19)


### Bug Fixes

* Fixed bug with async retry and error handling. ([a8d53dc](https://github.com/cadenzaio/cadenza/commit/a8d53dc82de0224230c416b5d6df7fafc1d007fa))

## [3.0.8](https://github.com/cadenzaio/cadenza/compare/v3.0.7...v3.0.8) (2025-09-19)


### Bug Fixes

* Fixed bug with async retry. ([992a291](https://github.com/cadenzaio/cadenza/commit/992a291e2d16b83449388d4b5ab2d20519195525))

## [3.0.7](https://github.com/cadenzaio/cadenza/compare/v3.0.6...v3.0.7) (2025-09-19)


### Bug Fixes

* Improved execution trace handling. ([02c4265](https://github.com/cadenzaio/cadenza/commit/02c4265b29bbc5aecdce4ff8eea17f1e2e4a75c4))

## [3.0.6](https://github.com/cadenzaio/cadenza/compare/v3.0.5...v3.0.6) (2025-09-19)


### Bug Fixes

* Added executionTraceId to emissions. ([31e9a01](https://github.com/cadenzaio/cadenza/commit/31e9a013f781b472f7e95b21da0f05d488a011d8))

## [3.0.5](https://github.com/cadenzaio/cadenza/compare/v3.0.4...v3.0.5) (2025-09-19)


### Bug Fixes

* Minor fix ([ea174c1](https://github.com/cadenzaio/cadenza/commit/ea174c1979409fa5c5ad83fd729ecdeb5e230fc0))

## [3.0.4](https://github.com/cadenzaio/cadenza/compare/v3.0.3...v3.0.4) (2025-09-18)


### Bug Fixes

* Fixed signals being emitted event if task returns false or undefined. ([db691b7](https://github.com/cadenzaio/cadenza/commit/db691b70d387553a2f7a4e39483342a1dcce1256))

## [3.0.3](https://github.com/cadenzaio/cadenza/compare/v3.0.2...v3.0.3) (2025-09-18)


### Bug Fixes

* Fixed signals being emitted in meta tasks. ([d4992a7](https://github.com/cadenzaio/cadenza/commit/d4992a7761d114df0d5ce17a7e2bd872545b31b2))

## [3.0.2](https://github.com/cadenzaio/cadenza/compare/v3.0.1...v3.0.2) (2025-09-17)


### Bug Fixes

* Fixed nodes being executed in reverse order on every layer. ([737a62f](https://github.com/cadenzaio/cadenza/commit/737a62f94eaad08f94626702888dccc923083c11))

## [3.0.1](https://github.com/cadenzaio/cadenza/compare/v3.0.0...v3.0.1) (2025-09-17)


### Bug Fixes

* improved logging ([77ec16d](https://github.com/cadenzaio/cadenza/commit/77ec16dccc6ffaa6e76ef69cd8ee6e3ea6795784))

# [3.0.0](https://github.com/cadenzaio/cadenza/compare/v2.0.0...v3.0.0) (2025-09-15)


* BREAKING CHANGE: contractId is now changed to executionTraceId. ([f5b4567](https://github.com/cadenzaio/cadenza/commit/f5b45677e5bbb7db84cc061fe735943f8f8f8ff9))


### BREAKING CHANGES

* task.emitsAfter(...) is now called task.emits(...).

# [2.0.0](https://github.com/cadenzaio/cadenza/compare/v1.12.0...v2.0.0) (2025-09-12)


* BREAKING CHANGE: Tasks and Routines now does not have id's. They are now identified by their name and version. ([51be291](https://github.com/cadenzaio/cadenza/commit/51be291c1426ec8917818bc53c65b456b59189bd))


### BREAKING CHANGES

* Removed doOnFail on tasks. This is now replaced by signals emitOnFail(...).

# [1.12.0](https://github.com/cadenzaio/cadenza/compare/v1.11.16...v1.12.0) (2025-09-10)


### Features

* Added support for AsyncGenerators as task functions. ([bd2dbf4](https://github.com/cadenzaio/cadenza/commit/bd2dbf4724f0d71c6f0d98a3ae544cce2ae198ea))

## [1.11.16](https://github.com/cadenzaio/cadenza/compare/v1.11.15...v1.11.16) (2025-09-04)


### Bug Fixes

* Fixed issue with task options upon creation. ([ebb00c2](https://github.com/cadenzaio/cadenza/commit/ebb00c2cb91ee985031711995c824ce08f372e45))

## [1.11.15](https://github.com/cadenzaio/cadenza/compare/v1.11.14...v1.11.15) (2025-09-03)


### Bug Fixes

* Fixed bug with retry not working when a task was child to another task. ([7b4fef5](https://github.com/cadenzaio/cadenza/commit/7b4fef571293ace9bf96e98748dbbdbed51d34a9))

## [1.11.14](https://github.com/cadenzaio/cadenza/compare/v1.11.13...v1.11.14) (2025-09-03)


### Bug Fixes

* Fixed bugs and confusion due to metaData typo. ([ea3bcf2](https://github.com/cadenzaio/cadenza/commit/ea3bcf2824d5314e63fff8f1a3d6253ad0da41f8))

## [1.11.13](https://github.com/cadenzaio/cadenza/compare/v1.11.12...v1.11.13) (2025-09-02)


### Bug Fixes

* Removed protected and private declarations to be able to have nested libraries. ([85a4f93](https://github.com/cadenzaio/cadenza/commit/85a4f9358cbdc421c47f2746aaf44d13c6668e0a))

## [1.11.12](https://github.com/cadenzaio/cadenza/compare/v1.11.11...v1.11.12) (2025-09-01)


### Bug Fixes

* Improved logging ([1796161](https://github.com/cadenzaio/cadenza/commit/179616166b83522069cae717aaa62dc68381a5c8))

## [1.11.11](https://github.com/cadenzaio/cadenza/compare/v1.11.10...v1.11.11) (2025-09-01)


### Bug Fixes

* Added verbose distinction to Node execution logging. ([45f15e9](https://github.com/cadenzaio/cadenza/commit/45f15e95b02fac9fbb596978a7e71d506e27fdfb))

## [1.11.10](https://github.com/cadenzaio/cadenza/compare/v1.11.9...v1.11.10) (2025-09-01)


### Bug Fixes

* Added task name field to signal consumption. ([44955a7](https://github.com/cadenzaio/cadenza/commit/44955a78870193e4cb6659882317d2b547a921e1))

## [1.11.9](https://github.com/cadenzaio/cadenza/compare/v1.11.8...v1.11.9) (2025-09-01)


### Bug Fixes

* Improved separation between normal emission and metrics emission. ([fcbc920](https://github.com/cadenzaio/cadenza/commit/fcbc920ef160d36cd6cb7272a0d0f65781003d02))

## [1.11.8](https://github.com/cadenzaio/cadenza/compare/v1.11.7...v1.11.8) (2025-09-01)


### Bug Fixes

* Improved Levels of logging by adding verbose mode. ([492cd1c](https://github.com/cadenzaio/cadenza/commit/492cd1c358395303efcce23e2960724a9b484612))

## [1.11.7](https://github.com/cadenzaio/cadenza/compare/v1.11.6...v1.11.7) (2025-09-01)


### Bug Fixes

* Fixed emission of signals in normal mode for meta tasks. Now Metrics requires normal or production mode but all other emissions will be processed. ([2242de8](https://github.com/cadenzaio/cadenza/commit/2242de81c376f6d287d20a321aa2799e9a74702a))

## [1.11.6](https://github.com/cadenzaio/cadenza/compare/v1.11.5...v1.11.6) (2025-08-31)


### Bug Fixes

* Improved debug logging ([e286ebb](https://github.com/cadenzaio/cadenza/commit/e286ebb2f47dbfc6647111db47ace8e43b59534b))

## [1.11.5](https://github.com/cadenzaio/cadenza/compare/v1.11.4...v1.11.5) (2025-08-31)


### Bug Fixes

* Removed console.log ([1917266](https://github.com/cadenzaio/cadenza/commit/1917266d06b9d69595ddd1936f51d0201f5fc4cf))

## [1.11.4](https://github.com/cadenzaio/cadenza/compare/v1.11.3...v1.11.4) (2025-08-31)


### Bug Fixes

* Fixed bug where the signal emission metadata would get deleted. ([033dd62](https://github.com/cadenzaio/cadenza/commit/033dd6293e8c8c0bcc4845deb2bad0f0e97f0889))

## [1.11.3](https://github.com/cadenzaio/cadenza/compare/v1.11.2...v1.11.3) (2025-08-30)


### Bug Fixes

* fixed bug where runner would emit in a loop for sub meta flows. ([72cf7f2](https://github.com/cadenzaio/cadenza/commit/72cf7f28b8bc6190b8262ad79dd268944d35e410))

## [1.11.2](https://github.com/cadenzaio/cadenza/compare/v1.11.1...v1.11.2) (2025-08-29)


### Bug Fixes

* Fixed signal broker not executing ".*" wild card. ([dbc0fdf](https://github.com/cadenzaio/cadenza/commit/dbc0fdfc01d78a6efdb778e6609d99700b58ac88))

## [1.11.1](https://github.com/cadenzaio/cadenza/compare/v1.11.0...v1.11.1) (2025-08-29)


### Bug Fixes

* better signal logging in debug mode. ([37c6eaf](https://github.com/cadenzaio/cadenza/commit/37c6eaf08c3beb0e1c20c5b23648fb9df38c7d95))

# [1.11.0](https://github.com/cadenzaio/cadenza/compare/v1.10.1...v1.11.0) (2025-08-29)


### Features

* improved Cadenza reset ([73d1ae1](https://github.com/cadenzaio/cadenza/commit/73d1ae13a0e15198748a8c4d28ced744e86520d8))

## [1.10.1](https://github.com/cadenzaio/cadenza/compare/v1.10.0...v1.10.1) (2025-08-26)


### Bug Fixes

* removed console log. ([7e123b4](https://github.com/cadenzaio/cadenza/commit/7e123b45e5a10726616145615dc99e2c6e46c549))

# [1.10.0](https://github.com/cadenzaio/cadenza/compare/v1.9.1...v1.10.0) (2025-08-26)


### Features

* Improved signal registration and signal emission handling. More metadata is added in both cases. ([1bd3ef5](https://github.com/cadenzaio/cadenza/commit/1bd3ef53f1b834e7d176d06c7fc32720bb074edc))

## [1.9.1](https://github.com/cadenzaio/cadenza/compare/v1.9.0...v1.9.1) (2025-08-19)


### Bug Fixes

* Fixed bug related to tracking signal emission and consumption ([47763d4](https://github.com/cadenzaio/cadenza/commit/47763d422394b3eb3627863b98a4dbee6999941b))

# [1.9.0](https://github.com/cadenzaio/cadenza/compare/v1.8.0...v1.9.0) (2025-08-19)


### Features

* Added better signal handling for extensions ([25b7484](https://github.com/cadenzaio/cadenza/commit/25b74846af4d7a8dac75b52d23ab09cbb5893ce0))
* Added per Task retrial functionality ([9b45ead](https://github.com/cadenzaio/cadenza/commit/9b45ead906488c999c2073936b7eda5668dfb8bb))

# [1.8.0](https://github.com/cadenzaio/cadenza/compare/v1.7.11...v1.8.0) (2025-08-14)


### Features

* Added per Task retrial functionality ([91505ee](https://github.com/cadenzaio/cadenza/commit/91505eec7b66a734e3c7d1572159c2543620c956))

## [1.7.11](https://github.com/cadenzaio/cadenza/compare/v1.7.10...v1.7.11) (2025-08-12)


### Bug Fixes

* Improved debug logging ([2edcd1a](https://github.com/cadenzaio/cadenza/commit/2edcd1a7b0d4723046c5a609d5e8268954bd527a))

## [1.7.10](https://github.com/cadenzaio/cadenza/compare/v1.7.9...v1.7.10) (2025-08-12)


### Bug Fixes

* Improved schema validation to account for undefined and null values ([79f3d90](https://github.com/cadenzaio/cadenza/commit/79f3d900c536fda3bb394dd62e99df2c4b80e8e0))

## [1.7.9](https://github.com/cadenzaio/cadenza/compare/v1.7.8...v1.7.9) (2025-08-12)


### Bug Fixes

* Fixed issues with context for meta execution ([336dde4](https://github.com/cadenzaio/cadenza/commit/336dde4204cc83d233a0f1acc85a1c8dab802224))

## [1.7.8](https://github.com/cadenzaio/cadenza/compare/v1.7.7...v1.7.8) (2025-08-12)


### Bug Fixes

* Fixed debug log ([b3c11da](https://github.com/cadenzaio/cadenza/commit/b3c11da9a78d4a3902ffe342f3e413b9e36860dc))

## [1.7.7](https://github.com/cadenzaio/cadenza/compare/v1.7.6...v1.7.7) (2025-08-12)


### Bug Fixes

* Added debugging to meta runner as well ([19d0470](https://github.com/cadenzaio/cadenza/commit/19d04700805d2a831a6ae519bd022a2b0c3ca91a))

## [1.7.6](https://github.com/cadenzaio/cadenza/compare/v1.7.5...v1.7.6) (2025-08-12)


### Bug Fixes

* Fixed bug in SignalParticipant.ts that would pass the GraphContext object as a context to the emitted signals. ([ec483bc](https://github.com/cadenzaio/cadenza/commit/ec483bc504f3cf8675ea62c2a10c79186a261296))

## [1.7.5](https://github.com/cadenzaio/cadenza/compare/v1.7.4...v1.7.5) (2025-08-12)


### Bug Fixes

* Better signal validation ([bbbf6c6](https://github.com/cadenzaio/cadenza/commit/bbbf6c691f8a777fedbf9584c8c10acacd096512))

## [1.7.4](https://github.com/cadenzaio/cadenza/compare/v1.7.3...v1.7.4) (2025-08-12)


### Bug Fixes

* Better signal validation error ([85074ae](https://github.com/cadenzaio/cadenza/commit/85074ae001b061ed670b9b906eb12fc175c399f1))

## [1.7.3](https://github.com/cadenzaio/cadenza/compare/v1.7.2...v1.7.3) (2025-08-12)


### Bug Fixes

* exposed more classes for extensions ([96f01d7](https://github.com/cadenzaio/cadenza/commit/96f01d745db739c52e97d1aad34c23af87b67fa8))

## [1.7.2](https://github.com/cadenzaio/cadenza/compare/v1.7.1...v1.7.2) (2025-08-11)


### Bug Fixes

* exposed functions in Cadenza class for extensions ([1fadb5b](https://github.com/cadenzaio/cadenza/commit/1fadb5b938af4bd7ddb366f8ee47ba320754fe71))

## [1.7.1](https://github.com/cadenzaio/cadenza/compare/v1.7.0...v1.7.1) (2025-08-11)


### Bug Fixes

* Fixed Cadenza mode ([04bb869](https://github.com/cadenzaio/cadenza/commit/04bb86903ac606f5ec744a0fc6e9be068fbf03bd))

# [1.7.0](https://github.com/cadenzaio/cadenza/compare/v1.6.0...v1.7.0) (2025-08-09)


### Features

* Added global debug and dev mode. ([1986f8f](https://github.com/cadenzaio/cadenza/commit/1986f8faa787aa2e7daa32db02febe5f8ea4695b))

# [1.6.0](https://github.com/cadenzaio/cadenza/compare/v1.5.1...v1.6.0) (2025-08-07)


### Features

* Added possibility to update task schemas. ([3879b74](https://github.com/cadenzaio/cadenza/commit/3879b74e45552bc8f9fb7eab10ff7ca44a719126))

## [1.5.1](https://github.com/cadenzaio/cadenza/compare/v1.5.0...v1.5.1) (2025-08-06)


### Bug Fixes

* Added more index exports to enable extensions. ([88c32a3](https://github.com/cadenzaio/cadenza/commit/88c32a3424f604d7ebfa4b80fe6ec34422785598))

# [1.5.0](https://github.com/cadenzaio/cadenza/compare/v1.4.0...v1.5.0) (2025-08-06)


### Features

* input and output context schema definition and validation. ([091c9b3](https://github.com/cadenzaio/cadenza/commit/091c9b3d68357ad956b8e4525ee3d5aa7a972b9e))

# [1.4.0](https://github.com/cadenzaio/cadenza/compare/v1.3.0...v1.4.0) (2025-07-31)


### Features

* SignalBroker is now exposing the observed signals. ([2c955dd](https://github.com/cadenzaio/cadenza/commit/2c955dd3d05b1c9f251172d4123125c4f2f8b415))

# [1.3.0](https://github.com/cadenzaio/cadenza/compare/v1.2.0...v1.3.0) (2025-07-30)


### Features

* More exports in index.ts ([8f67a14](https://github.com/cadenzaio/cadenza/commit/8f67a1456d3496b843765b99f03454c94e4a33ce))

# [1.2.0](https://github.com/cadenzaio/cadenza/compare/v1.1.0...v1.2.0) (2025-07-30)


### Features

* Added more exports in index.ts ([fd532a5](https://github.com/cadenzaio/cadenza/commit/fd532a5c4706698f437b52ba77f31a755ec1288c))

# [1.1.0](https://github.com/cadenzaio/cadenza/compare/v1.0.1...v1.1.0) (2025-07-30)


### Features

* Added exports of all types of tasks and routines in index.ts ([dce85f6](https://github.com/cadenzaio/cadenza/commit/dce85f651aa898a5879af47b19ba19088b3bc2d3))

## [1.0.1](https://github.com/cadenzaio/cadenza/compare/v1.0.0...v1.0.1) (2025-07-27)


### Bug Fixes

* publish config ([7e16605](https://github.com/cadenzaio/cadenza/commit/7e1660500639d535dac11c16da02ce476e10f08c))

# 1.0.0 (2025-07-26)


### Bug Fixes

* added type package ([9ba073d](https://github.com/cadenzaio/cadenza/commit/9ba073d93c7fae8ae28737f253f055de41579861))
