import clsx from "clsx";
import svgPaths from "./svg-nxoi2r38db";
type Group35155HelperProps = {
  additionalClassNames?: string;
};

function Group35155Helper({ children, additionalClassNames = "" }: React.PropsWithChildren<Group35155HelperProps>) {
  return (
    <div className={clsx("absolute flex items-center justify-center", additionalClassNames)}>
      <div className="-scale-y-100 flex-none h-[56.043px] w-[40.748px]">
        <div className="relative size-full" data-name="Vector">
          <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 40.7479 56.0425">
            {children}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function Logo() {
  return (
    <div className="relative size-full" data-name="logo">
      <div className="absolute contents left-0 top-0">
        <Group35155Helper additionalClassNames="inset-[26.53%_0_1.74%_88.08%]">
          <path d={svgPaths.p2becf040} fill="var(--fill-0, #FFFFFF)" id="Vector" />
        </Group35155Helper>
        <div className="absolute flex inset-[26.34%_13.91%_0.01%_68.53%] items-center justify-center">
          <div className="-scale-y-100 flex-none h-[57.543px] w-[59.993px]">
            <div className="relative size-full" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 59.9932 57.5425">
                <path d={svgPaths.p50cf8c0} fill="var(--fill-0, #FFFFFF)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
        <div className="absolute flex inset-[0_32.66%_0_49.08%] items-center justify-center">
          <div className="-scale-y-100 flex-none h-[78.133px] w-[62.4px]">
            <div className="relative size-full" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 62.3998 78.1331">
                <path d={svgPaths.p1cebb900} fill="var(--fill-0, #FFFFFF)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
        <div className="absolute flex inset-[26.53%_68.25%_1.75%_27.26%] items-center justify-center">
          <div className="-scale-y-100 flex-none h-[56.043px] w-[15.336px]">
            <div className="relative size-full" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.336 56.0425">
                <path d="M0 0V56.0425H15.336V0H0Z" fill="var(--fill-0, #FFFFFF)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
        <Group35155Helper additionalClassNames="inset-[26.53%_74.67%_1.74%_13.41%]">
          <path d={svgPaths.p3e35f740} fill="var(--fill-0, #FFFFFF)" id="Vector" />
        </Group35155Helper>
        <div className="absolute flex inset-[8.19%_88.87%_1.76%_0] items-center justify-center">
          <div className="-scale-y-100 flex-none h-[70.36px] w-[38.04px]">
            <div className="relative size-full" data-name="Vector">
              <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 38.0399 70.3598">
                <path d={svgPaths.p28cf8200} fill="var(--fill-0, #FFFFFF)" id="Vector" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}