Pod::Spec.new do |s|
  s.name           = 'ScreenRecorder'
  s.version        = '0.0.1'
  s.summary        = 'MoveLab in-app screen recording (ReplayKit RPScreenRecorder)'
  s.description    = 'start() / stop() -> file URI of an .mp4 of the app screen.'
  s.author         = 'MoveLab'
  s.homepage       = 'https://example.com/movelab'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ReplayKit', 'AVFoundation'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
