<template>
  <div class="relative min-h-screen flex items-center justify-center p-4"
    style="background-image: url('/authcard_bg.jpg'); background-size: cover; background-position: center;">
    <div class="absolute inset-0 bg-white/60"></div>
    <div class="relative flex w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden" style="min-height: 480px;">
      <div class="relative hidden md:flex w-[42%] overflow-hidden">
        <img src="/authcard.png" alt="login" class="absolute inset-0 w-full h-full object-cover" />
      </div>

      <div class="flex-1 bg-white flex flex-col justify-start px-8 py-10">
        <slot />
      </div>
    </div>
  </div>
</template>
